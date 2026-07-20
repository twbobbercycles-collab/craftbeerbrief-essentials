/**
 * FermentationPage — Fermentation Tracker for the Operations tier.
 * Shows a vessel dashboard with SVG tank illustrations, gravity sparkline charts,
 * pending assignment queue, and full detail view with gravity log.
 * URL: /fermentation
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { useReadOnly } from '../../hooks/useReadOnly'
import { calculateTrueCostPerPint } from '../recipes/recipeUtils'
import { DEFAULT_SIZE_BY_TYPE } from '../../utils/packagingTypes'

// ─── Constants ────────────────────────────────────────────────────────────────

const VESSEL_TYPES = [
  'Conical Fermenter', 'Unitank', 'Bright Tank', 'Open Fermenter',
  'Barrel', 'Brite Beer Tank', 'Other',
]

const FERM_TYPE_LABELS = {
  standard:           'Standard',
  open_fermentation:  'Open Fermentation',
  mixed_fermentation: 'Mixed Fermentation',
  spontaneous:        'Spontaneous',
  kveik:              'Kveik',
  cold_fermentation:  'Cold Fermentation',
}

const STATUS_LABELS = {
  pending_assignment: 'Pending Assignment',
  fermenting:         'Fermenting',
  conditioning:       'Conditioning',
  lagering:           'Lagering',
  ready_to_package:   'Ready to Package',
  packaged:           'Packaged',
  dumped:             'Dumped',
}

const STATUS_STYLES = {
  pending_assignment: 'bg-gray-100 text-gray-600',
  fermenting:         'bg-amber/15 text-amber',
  conditioning:       'bg-blue-100 text-blue-700',
  lagering:           'bg-indigo-100 text-indigo-700',
  ready_to_package:   'bg-green-100 text-success',
  packaged:           'bg-teal-100 text-teal-700',
  dumped:             'bg-red-100 text-danger',
}

// Maps each status to the valid next statuses (null = no progression)
const STATUS_TRANSITIONS = {
  pending_assignment: ['fermenting'],
  fermenting:         ['conditioning', 'ready_to_package'],
  conditioning:       ['lagering', 'ready_to_package'],
  lagering:           ['ready_to_package'],
  ready_to_package:   ['packaged'],
  packaged:           [],
  dumped:             [],
}

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// Builds a human-readable label for a fermentation: "2026-003 — TestIPA (American IPA)"
// Suppresses beer_name when it is null, empty, or identical to the batch_number
// (which happens when the auto-create fallback used the batch number as the name).
function fermLabel(f) {
  const batch = f.batch_number || 'Unknown Batch'
  const name  = f.beer_name && f.beer_name !== f.batch_number ? f.beer_name : null
  const style = f.beer_style ? `(${f.beer_style})` : ''
  if (name) return `${batch} — ${name} ${style}`.trim()
  return batch
}

// ─── SparklineTooltip ─────────────────────────────────────────────────────────
// Custom recharts tooltip for vessel card sparklines (gravity and temperature).

function SparklineTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const date = d?.payload?.date
    ? new Date(d.payload.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : label
  const formatted = unit === '°F'
    ? (d?.value?.toFixed(1) ?? d?.value)
    : (d?.value?.toFixed(3) ?? d?.value)
  return (
    <div className="bg-white border border-gray-200 rounded-md shadow-sm px-2 py-1.5">
      <p className="text-xs text-navy font-semibold">{formatted}{unit}</p>
      <p className="text-xs text-gray-400">{date}</p>
    </div>
  )
}

// ─── Entry Point — TierGate wrapper ──────────────────────────────────────────

export default function FermentationPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="fermentation_tracker"
      featureName="Fermentation Tracker"
      featureDescription="Track every batch from pitch to package. Assign vessels, log gravity readings, monitor attenuation, and schedule dry hops — all in one place."
    >
      <FermentationTracker />
    </TierGate>
  )
}

// ─── Main Tracker ─────────────────────────────────────────────────────────────

function FermentationTracker() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  const [vessels, setVessels]         = useState([])
  const [fermentations, setFermentations] = useState([]) // all non-packaged/dumped
  const [gravityMap, setGravityMap]   = useState({})     // fermentation_id → readings[]
  const [loading, setLoading]         = useState(true)

  // Modal open state — one state per modal type
  const [manageOpen, setManageOpen]       = useState(false)
  const [addFermOpen, setAddFermOpen]     = useState(false)
  const [logTarget, setLogTarget]         = useState(null)  // fermentation to log reading for
  const [assignTarget, setAssignTarget]   = useState(null)  // { fermentation?, vessel? }
  const [detailTarget, setDetailTarget]   = useState(null)  // fermentation object for detail view

  // Load vessels and all active fermentations, then their gravity readings in one pass
  const loadData = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)

    // Use .in() for the statuses we WANT rather than .not().in() to avoid
    // Supabase PostgREST syntax edge cases that can silently drop rows.
    const ACTIVE_STATUSES = ['pending_assignment', 'fermenting', 'conditioning', 'lagering', 'ready_to_package']

    const [vRes, fRes] = await Promise.all([
      supabase.from('fermentation_vessels')
        .select('*')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('fermentations')
        .select('*')
        .eq('brewery_id', brewery.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false }),
    ])

    const vList = vRes.data ?? []
    const fList = fRes.data ?? []

    // Debug: log what came back so we can confirm data is reaching the component
    console.log('[FermentationTracker] vessels loaded:', vList.length, vList.map(v => v.vessel_name))
    console.log('[FermentationTracker] fermentations loaded:', fList.length, fList.map(f => `${f.beer_name} (${f.status})`))
    const pendingCount = fList.filter(f => f.status === 'pending_assignment').length
    console.log('[FermentationTracker] pending_assignment count:', pendingCount)
    if (fRes.error) console.error('[FermentationTracker] fermentations query error:', fRes.error)

    setVessels(vList)
    setFermentations(fList)

    // Fetch all gravity readings for these fermentations in one query
    if (fList.length > 0) {
      const ids = fList.map(f => f.id)
      const { data: readings } = await supabase
        .from('gravity_readings')
        .select('*')
        .in('fermentation_id', ids)
        .eq('reading_type', 'gravity')
        .order('reading_date', { ascending: true })

      const map = {}
      for (const r of readings ?? []) {
        if (!map[r.fermentation_id]) map[r.fermentation_id] = []
        map[r.fermentation_id].push(r)
      }
      setGravityMap(map)
    } else {
      setGravityMap({})
    }

    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadData() }, [loadData])

  // Pending fermentations — no vessel assigned yet
  const pending = fermentations.filter(f => f.status === 'pending_assignment')

  // Map vessel_id → fermentation for the vessel grid
  const vesselFermMap = useMemo(() => {
    const map = {}
    for (const f of fermentations) {
      if (f.vessel_id) map[f.vessel_id] = f
    }
    return map
  }, [fermentations])

  // Empty vessels — no active fermentation assigned
  const emptyVessels = vessels.filter(v => !vesselFermMap[v.id])

  if (loading) return <LoadingSpinner message="Loading fermentation tracker..." />

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">Fermentation Tracker</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setManageOpen(true)}
            className="text-sm border border-gray-300 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
          >
            Manage Vessels
          </button>
          <button
            onClick={() => setAddFermOpen(true)}
            disabled={isReadOnly}
            className="text-sm bg-amber hover:bg-amber-dark text-white rounded-lg px-4 py-2 font-semibold transition-colors disabled:opacity-50"
          >
            + Add Fermentation
          </button>
        </div>
      </div>

      {/* Pending assignment section — always rendered so we can diagnose empty vs hidden.
          When no pending fermentations exist it shows a quiet "none pending" note. */}
      <PendingSection
        fermentations={pending}
        vessels={vessels}
        onAssign={f => setAssignTarget({ fermentation: f })}
        isReadOnly={isReadOnly}
      />

      {/* No vessels setup card */}
      {vessels.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">🧪</p>
          <h3 className="font-bold text-navy text-lg mb-2">Set Up Your Fermentation Vessels</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-5">
            Add each fermenter, bright tank, and conditioning vessel in your brewery to start tracking
            batches from pitch to package.
          </p>
          <button
            onClick={() => setManageOpen(true)}
            className="bg-amber hover:bg-amber-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            Add Your First Vessel
          </button>
        </div>
      ) : (
        /* Vessel grid — 3 columns on desktop, 2 on tablet, 1 on mobile */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {vessels.map(v => {
            const ferm = vesselFermMap[v.id] ?? null
            return (
              <VesselCard
                key={v.id}
                vessel={v}
                fermentation={ferm}
                readings={gravityMap[ferm?.id ?? ''] ?? []}
                onLogReading={setLogTarget}
                onViewDetail={setDetailTarget}
                onAssignEmpty={() => setAssignTarget({ vessel: v })}
                isReadOnly={isReadOnly}
              />
            )
          })}
        </div>
      )}

      {/* ── Modals ── */}

      {manageOpen && (
        <ManageVesselsModal
          vessels={vessels}
          onClose={() => setManageOpen(false)}
          onChanged={loadData}
        />
      )}

      {addFermOpen && (
        <AddFermentationModal
          onClose={() => setAddFermOpen(false)}
          onSaved={() => { setAddFermOpen(false); loadData() }}
        />
      )}

      {logTarget && (
        <LogReadingModal
          fermentation={logTarget}
          onClose={() => setLogTarget(null)}
          onSaved={() => { setLogTarget(null); loadData() }}
        />
      )}

      {assignTarget && (
        <AssignVesselModal
          preSelectedFermentation={assignTarget.fermentation ?? null}
          preSelectedVessel={assignTarget.vessel ?? null}
          fermentations={pending}
          vessels={emptyVessels}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); loadData() }}
        />
      )}

      {detailTarget && (
        <FermentationDetailModal
          fermentation={detailTarget}
          vessels={vessels}
          availableVessels={vessels.filter(v => !vesselFermMap[v.id] || v.id === detailTarget?.vessel_id)}
          readings={gravityMap[detailTarget.id] ?? []}
          onClose={() => { setDetailTarget(null); loadData() }}
          onUpdated={updated => {
            setDetailTarget(updated)
            setFermentations(prev => prev.map(f => f.id === updated.id ? updated : f))
          }}
          onReadingChanged={loadData}
        />
      )}
    </div>
  )
}

// ─── PendingSection ───────────────────────────────────────────────────────────
// Collapsible list of fermentations waiting to be assigned to a vessel.

function PendingSection({ fermentations, vessels, onAssign, isReadOnly }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-amber/5 border border-amber/30 rounded-xl overflow-hidden">
      {/* Header row — click to collapse */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber font-semibold text-sm">
            ⏳ Awaiting Vessel Assignment
          </span>
          {fermentations.length > 0 && (
            <span className="bg-amber text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {fermentations.length}
            </span>
          )}
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        fermentations.length === 0 ? (
          /* Shown when section renders but no pending records exist — confirms the section itself is visible */
          <p className="px-5 pb-4 text-xs text-gray-400 italic">
            No pending assignments — all fermentation batches have vessels assigned.
          </p>
        ) : (
          <div className="divide-y divide-amber/10">
            {fermentations.map(f => {
              const brewDate = f.pitch_date
                ? new Date(f.pitch_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'
              return (
                <div key={f.id} className="flex items-center justify-between px-5 py-3 flex-wrap gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy text-sm">
                      {f.beer_name}
                      {f.beer_style && <span className="font-normal text-gray-400 ml-1.5">({f.beer_style})</span>}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      {f.batch_number && <span className="font-mono bg-navy/10 text-navy px-1.5 py-0.5 rounded text-[10px] font-bold">{f.batch_number}</span>}
                      <span>Brew date: {brewDate}</span>
                      {f.volume_in_fermenter && <span>{f.volume_in_fermenter} {f.volume_unit}</span>}
                      {f.yeast_strain && <span>Yeast: {f.yeast_strain}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onAssign(f)}
                    disabled={isReadOnly || vessels.filter(v => v.is_active).length === 0}
                    className="shrink-0 text-xs bg-amber hover:bg-amber-dark text-white rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-50"
                  >
                    Assign Vessel
                  </button>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

// ─── TankSVG ──────────────────────────────────────────────────────────────────
// Dispatches to the correct vessel-type illustration based on vessel_type prop.
// All variants share the same color/fill/bubble logic via helper functions.

// Returns fill color and border color for a given fermentation status
function tankColors(status) {
  const fill = {
    fermenting:       '#F59E0B',
    conditioning:     '#93C5FD',
    lagering:         '#BFDBFE',
    ready_to_package: '#86EFAC',
  }[status] ?? '#E5E7EB'
  const border = {
    fermenting:       '#D97706',
    ready_to_package: '#16A34A',
    conditioning:     '#3B82F6',
    lagering:         '#6366F1',
  }[status] ?? '#D1D5DB'
  return { fill, border }
}

// Overlay icon rendered in the centre of any vessel when not actively fermenting
function StatusOverlay({ status, cx, cy }) {
  if (status === 'conditioning' || status === 'lagering')
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="22" fill="#3B82F6" opacity="0.65">❄</text>
  if (status === 'ready_to_package')
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="22" fill="#16A34A" opacity="0.85">✓</text>
  return null
}

// Four animated bubbles clipped to rise only within the supplied rect bounds
function Bubbles({ clipId, fillY, fillH, bodyTop, status }) {
  if (status !== 'fermenting' || fillH < 20) return null
  const top = bodyTop + 10
  const bottom = fillY + fillH - 4
  return (
    <>
      <circle cx="38" cy={bottom} r="2.5" fill="rgba(255,255,255,0.75)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom};${top}`} dur="2.1s" repeatCount="indefinite" begin="0s" />
        <animate attributeName="opacity" values="0.75;0" dur="2.1s" repeatCount="indefinite" begin="0s" />
      </circle>
      <circle cx="60" cy={bottom - 10} r="2" fill="rgba(255,255,255,0.65)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom - 10};${top}`} dur="2.6s" repeatCount="indefinite" begin="0.7s" />
        <animate attributeName="opacity" values="0.65;0" dur="2.6s" repeatCount="indefinite" begin="0.7s" />
      </circle>
      <circle cx="72" cy={bottom - 5} r="3" fill="rgba(255,255,255,0.55)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom - 5};${top}`} dur="2.3s" repeatCount="indefinite" begin="1.3s" />
        <animate attributeName="opacity" values="0.55;0" dur="2.3s" repeatCount="indefinite" begin="1.3s" />
      </circle>
      <circle cx="48" cy={bottom - 18} r="1.5" fill="rgba(255,255,255,0.65)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom - 18};${top}`} dur="1.9s" repeatCount="indefinite" begin="0.3s" />
        <animate attributeName="opacity" values="0.65;0" dur="1.9s" repeatCount="indefinite" begin="0.3s" />
      </circle>
    </>
  )
}

// Route to the right illustration based on vessel_type string
function TankSVG({ uid, fillPct = 0, status = 'empty', vesselType = 'Conical Fermenter' }) {
  const type = vesselType ?? 'Conical Fermenter'
  const props = { uid, fillPct, status }
  if (type === 'Barrel')                                   return <BarrelSVG {...props} />
  if (type === 'Open Fermenter')                           return <OpenFermenterSVG {...props} />
  if (type === 'Bright Tank' || type === 'Brite Beer Tank') return <BrightTankSVG {...props} />
  // Conical Fermenter, Unitank, Other — all use the conical shape
  return <ConicalSVG {...props} />
}

// ── Conical Fermenter / Unitank / Other ───────────────────────────────────────
// Tall cylinder with dome top, conical bottom tapering to a point, legs below.

function ConicalSVG({ uid, fillPct, status }) {
  // Geometry (viewBox 120 × 224) — taller cylinder, shorter cone
  const cx = 60
  const bodyX = 20, bodyW = 80, bodyTop = 22, bodyH = 130
  const coneH = 40
  const coneTop = bodyTop + bodyH        // y = 152
  const coneTip = coneTop + coneH        // y = 192
  const ey = 9
  const legY2   = coneTip + 28           // y = 220
  const legLX   = cx - 18, legRX = cx + 18
  const cylLeft = bodyX, cylRight = bodyX + bodyW

  const safeFill  = Math.min(Math.max(fillPct, 0), 100)
  const totalH    = bodyH + coneH        // 170 px of liquid space
  const fillPx    = Math.round(totalH * safeFill / 100)
  const coneFillH = Math.min(fillPx, coneH)
  const bodyFillH = Math.max(0, fillPx - coneH)
  const bodyFillY = bodyTop + bodyH - bodyFillH

  // Cone fill geometry — proportional triangle for partial fill;
  // expands to full base triangle once liquid rises into the cylinder body.
  const coneFullyFilled = bodyFillH > 0
  const coneFrac        = coneFullyFilled ? 1 : Math.min(coneFillH / coneH, 1)
  const coneFillTopY    = coneFullyFilled ? coneTop : coneTip - coneFillH
  const coneFillLeftX   = cx - (bodyW / 2) * coneFrac
  const coneFillRightX  = cx + (bodyW / 2) * coneFrac

  const { fill, border } = tankColors(status)
  const clipId = `cc-${uid}`

  return (
    <svg viewBox="0 0 120 224" width={110} height={200} aria-hidden="true">
      <defs>
        {/* Clip used by Bubbles to keep them inside the cylinder body */}
        <clipPath id={clipId}>
          <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} />
        </clipPath>
      </defs>

      {/* ── Body background ── */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill="#F9FAFB" />
      {/* Cone background */}
      <polygon
        points={`${cylLeft},${coneTop} ${cylRight},${coneTop} ${cx},${coneTip}`}
        fill="#F0F0F0"
      />

      {/* ── Liquid fill ── */}
      {/* Cone fill: proportional triangle rising from tip upward */}
      {fillPx > 0 && (
        <polygon
          points={`${coneFillLeftX},${coneFillTopY} ${coneFillRightX},${coneFillTopY} ${cx},${coneTip}`}
          fill={fill} opacity="0.72"
        />
      )}
      {/* Cylinder body fill rises from cone junction upward */}
      {bodyFillH > 0 && (
        <rect x={bodyX} y={bodyFillY} width={bodyW} height={bodyFillH}
          fill={fill} opacity="0.72" />
      )}

      {/* ── Dome top cap ── */}
      <path
        d={`M ${bodyX},${bodyTop} A ${bodyW/2},${ey * 2.5} 0 0,1 ${bodyX + bodyW},${bodyTop}`}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5"
      />
      <line x1={bodyX} y1={bodyTop} x2={bodyX} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />
      <line x1={bodyX + bodyW} y1={bodyTop} x2={bodyX + bodyW} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />

      {/* ── Cylinder body border ── */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH}
        fill="none" stroke={border} strokeWidth="1.5" />

      {/* ── Top ellipse (3D lip) ── */}
      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={ey}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5" />

      {/* ── Bottom ellipse at cylinder/cone junction ── */}
      <ellipse cx={cx} cy={coneTop} rx={bodyW / 2} ry={ey}
        fill={bodyFillH > 0 ? fill : '#E0E0E0'}
        opacity={bodyFillH > 0 ? '0.72' : '1'}
        stroke={border} strokeWidth="1.5" />

      {/* ── Cone outline ── */}
      <line x1={cylLeft}  y1={coneTop} x2={cx} y2={coneTip} stroke={border} strokeWidth="1.5" />
      <line x1={cylRight} y1={coneTop} x2={cx} y2={coneTip} stroke={border} strokeWidth="1.5" />

      {/* ── Port/valve on cone side ── */}
      <rect x={cx + 14} y={coneTop + 12} width={10} height={6} rx="1"
        fill="#E5E7EB" stroke={border} strokeWidth="1" />
      <circle cx={cx + 19} cy={coneTop + 15} r="2" fill={border} opacity="0.5" />

      {/* ── Legs ── */}
      <line x1={legLX} y1={coneTip} x2={legLX - 6} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />
      <line x1={legRX} y1={coneTip} x2={legRX + 6} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />
      <line x1={legLX - 10} y1={legY2} x2={legLX - 2} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />
      <line x1={legRX + 2}  y1={legY2} x2={legRX + 10} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />

      {/* ── Bubbles (clipped to cylinder body) ── */}
      <Bubbles clipId={clipId} fillY={bodyFillY} fillH={bodyFillH} bodyTop={bodyTop} status={status} />

      {/* ── Status icon (centre of cylinder body) ── */}
      <StatusOverlay status={status} cx={cx} cy={bodyTop + bodyH / 2} />

      {/* Empty label */}
      {!fillPx && status === 'empty' && (
        <text x={cx} y={bodyTop + bodyH / 2 + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ── Bright Tank / Brite Beer Tank ─────────────────────────────────────────────
// Wider cylinder with a rounded dome bottom and a pressure gauge on the side.

function BrightTankSVG({ uid, fillPct, status }) {
  const cx = 60
  const bodyX = 15, bodyW = 90, bodyTop = 24, bodyH = 95
  const ey = 10
  // Dome bottom: a half-ellipse beneath the cylinder
  const domeH = 30
  const domeBottom = bodyTop + bodyH + domeH

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  const totalH = bodyH + domeH
  const fillPx = Math.round(totalH * safeFill / 100)
  const bodyFillH = Math.max(0, fillPx - domeH)
  const bodyFillY = bodyTop + bodyH - bodyFillH

  const { fill, border } = tankColors(status)
  const clipId = `bt-${uid}`

  return (
    <svg viewBox="0 0 120 200" width={110} height={175} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH + domeH + 5} />
        </clipPath>
      </defs>

      {/* Dome bottom background */}
      <path
        d={`M ${bodyX},${bodyTop + bodyH} Q ${cx},${domeBottom + 8} ${bodyX + bodyW},${bodyTop + bodyH}`}
        fill="#F0F0F0" stroke="none"
      />
      {/* Body background */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill="#F9FAFB" />

      {/* Fill in dome */}
      {fillPx > 0 && (
        <path
          d={`M ${bodyX},${bodyTop + bodyH} Q ${cx},${domeBottom + 8} ${bodyX + bodyW},${bodyTop + bodyH} Z`}
          fill={fill} opacity="0.72"
        />
      )}
      {/* Fill in body */}
      {bodyFillH > 0 && (
        <rect x={bodyX} y={bodyFillY} width={bodyW} height={bodyFillH}
          fill={fill} opacity="0.72" />
      )}

      {/* Dome outline */}
      <path
        d={`M ${bodyX},${bodyTop + bodyH} Q ${cx},${domeBottom + 8} ${bodyX + bodyW},${bodyTop + bodyH}`}
        fill="none" stroke={border} strokeWidth="1.5"
      />

      {/* Body border */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH}
        fill="none" stroke={border} strokeWidth="1.5" />

      {/* Top dome cap */}
      <path
        d={`M ${bodyX},${bodyTop} A ${bodyW/2},14 0 0,1 ${bodyX + bodyW},${bodyTop}`}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5"
      />
      <line x1={bodyX} y1={bodyTop} x2={bodyX} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />
      <line x1={bodyX + bodyW} y1={bodyTop} x2={bodyX + bodyW} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />

      {/* Top ellipse lip */}
      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={ey}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5" />

      {/* Pressure gauge circle on side */}
      <circle cx={bodyX + 14} cy={bodyTop + bodyH / 2} r="8"
        fill="#E5E7EB" stroke={border} strokeWidth="1" />
      <line x1={bodyX + 14} y1={bodyTop + bodyH/2 - 5} x2={bodyX + 14} y2={bodyTop + bodyH/2 + 1}
        stroke={border} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={bodyX + 14} y1={bodyTop + bodyH/2} x2={bodyX + 18} y2={bodyTop + bodyH/2 - 2}
        stroke={border} strokeWidth="1.5" strokeLinecap="round" />

      {/* Bubbles */}
      <Bubbles clipId={clipId} fillY={bodyFillY} fillH={bodyFillH} bodyTop={bodyTop} status={status} />

      <StatusOverlay status={status} cx={cx} cy={bodyTop + bodyH / 2} />
      {!fillPx && status === 'empty' && (
        <text x={cx} y={bodyTop + bodyH / 2 + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ── Open Fermenter ────────────────────────────────────────────────────────────
// Wide shallow tub viewed from a slight isometric angle, open top, stave lines.

function OpenFermenterSVG({ uid, fillPct, status }) {
  // A shallow trapezoid viewed from above at a slight angle: wider at top, slight perspective
  const cx = 65
  // Outer tub: wide rectangle with angled sides (trapezoid for depth)
  const tubTop = 45, tubH = 65
  const outerW = 110, innerW = 90
  const leftX  = (130 - outerW) / 2  // 10
  const rightX = leftX + outerW       // 120
  // Inner bottom (slightly narrower for depth illusion)
  const innerLeft  = (130 - innerW) / 2  // 20
  const innerRight = innerLeft + innerW   // 110
  const innerTop   = tubTop + 10, innerH = tubH - 14
  const ey = 8

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  const fillH = Math.round(tubH * safeFill / 100)
  const fillY = tubTop + tubH - fillH

  const { fill, border } = tankColors(status)

  // Stave lines (vertical wood lines on the side)
  const staveXs = [leftX + 16, leftX + 32, leftX + 48, leftX + 65, leftX + 81, leftX + 96]

  return (
    <svg viewBox="0 0 130 150" width={120} height={130} aria-hidden="true">
      {/* Tub side walls — front face (trapezoid) */}
      <rect x={leftX} y={tubTop} width={outerW} height={tubH} fill="#F9FAFB" rx="3" />

      {/* Vertical stave lines for wood texture */}
      {staveXs.map((x, i) => (
        <line key={i} x1={x} y1={tubTop + 4} x2={x} y2={tubTop + tubH - 4}
          stroke="#E0D8CC" strokeWidth="1" />
      ))}

      {/* Fill */}
      {fillH > 0 && (
        <rect x={leftX} y={fillY} width={outerW} height={fillH}
          fill={fill} opacity="0.72" rx="2" />
      )}

      {/* Tub border */}
      <rect x={leftX} y={tubTop} width={outerW} height={tubH}
        fill="none" stroke={border} strokeWidth="2" rx="3" />

      {/* Top rim ellipse — open top */}
      <ellipse cx={cx} cy={tubTop} rx={outerW / 2} ry={ey}
        fill={fillH > 0 ? fill : '#ECEFF4'} fillOpacity={fillH > 0 ? '0.5' : '1'}
        stroke={border} strokeWidth="2" />

      {/* Bottom ellipse for depth */}
      <ellipse cx={cx} cy={tubTop + tubH} rx={outerW / 2 - 4} ry={ey - 2}
        fill="none" stroke={border} strokeWidth="1.5" />

      {/* Horizontal hoop bands */}
      {[tubTop + tubH * 0.28, tubTop + tubH * 0.65].map((y, i) => (
        <rect key={i} x={leftX - 2} y={y - 3} width={outerW + 4} height={6}
          fill="#D4C9B8" stroke={border} strokeWidth="0.5" rx="1" opacity="0.8" />
      ))}

      <StatusOverlay status={status} cx={cx} cy={tubTop + tubH / 2} />
      {!fillH && status === 'empty' && (
        <text x={cx} y={tubTop + tubH / 2 + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ── Barrel ────────────────────────────────────────────────────────────────────
// Classic barrel shape: wider in the middle, narrowing at top and bottom,
// with horizontal hoop bands.

function BarrelSVG({ uid, fillPct, status }) {
  const cx = 60, cy_mid = 95
  const W = 120, H = 175
  // The barrel outline is a path with cubic bezier curves for the bulge
  const topY = 20, botY = 165, midY = 92
  const topHalfW = 38, midHalfW = 52, botHalfW = 38

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  const fillH = (botY - topY) * safeFill / 100
  const fillTopY = botY - fillH

  const { fill, border } = tankColors(status)
  const clipId = `bar-${uid}`

  // Barrel outline path (right side, then mirrored for left)
  const barrelPath = `
    M ${cx - topHalfW},${topY}
    C ${cx - midHalfW},${topY + 40} ${cx - midHalfW},${midY + 30} ${cx - botHalfW},${botY}
    L ${cx + botHalfW},${botY}
    C ${cx + midHalfW},${midY + 30} ${cx + midHalfW},${topY + 40} ${cx + topHalfW},${topY}
    Z
  `

  // Hoop positions
  const hoops = [topY + 8, topY + 22, midY - 2, botY - 22, botY - 8]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={110} height={165} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={barrelPath} />
        </clipPath>
      </defs>

      {/* Barrel body background */}
      <path d={barrelPath} fill="#F5F0E8" />

      {/* Fill — clipped to barrel shape */}
      {fillH > 0 && (
        <rect x={cx - midHalfW - 2} y={fillTopY} width={(midHalfW + 2) * 2} height={fillH + 5}
          fill={fill} opacity="0.72" clipPath={`url(#${clipId})`} />
      )}

      {/* Barrel outline */}
      <path d={barrelPath} fill="none" stroke={border} strokeWidth="2" />

      {/* Hoop bands */}
      {hoops.map((hy, i) => {
        // Calculate barrel half-width at this y using rough interpolation
        const t = (hy - topY) / (botY - topY)
        const hw = topHalfW + (midHalfW - topHalfW) * Math.sin(t * Math.PI) * 1.1
        return (
          <ellipse key={i} cx={cx} cy={hy} rx={hw} ry={5}
            fill="none" stroke={border} strokeWidth="2.5" opacity="0.85" />
        )
      })}

      {/* Top and bottom flat face ellipses */}
      <ellipse cx={cx} cy={topY} rx={topHalfW} ry={6}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5" />
      <ellipse cx={cx} cy={botY} rx={botHalfW} ry={6}
        fill={fillH > 0 ? fill : '#E0D8CC'} fillOpacity={fillH > 0 ? '0.72' : '1'}
        stroke={border} strokeWidth="1.5" />

      {/* Bung hole */}
      <ellipse cx={cx} cy={midY - 10} rx={5} ry={3}
        fill="#D4C9B8" stroke={border} strokeWidth="1" />

      <StatusOverlay status={status} cx={cx} cy={midY} />
      {!fillH && status === 'empty' && (
        <text x={cx} y={midY + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ─── MiniSparkline ────────────────────────────────────────────────────────────
// Compact recharts gravity chart for the vessel card. No axis labels.

function MiniSparkline({ readings, targetFg, fermentation }) {
  if (readings.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center border border-dashed border-gray-200 rounded-lg">
        <p className="text-xs text-gray-400">Log gravity to see trend</p>
      </div>
    )
  }

  if (readings.length === 1) {
    return (
      <div className="h-20 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-base font-bold text-amber">{parseFloat(readings[0].gravity).toFixed(3)}</p>
          <p className="text-[11px] text-gray-400">1 reading</p>
        </div>
      </div>
    )
  }

  // Sort chronologically then assign a sequential index as x — avoids null day values
  // that cause recharts to collapse all points to the same x position.
  const sorted = [...readings].sort((a, b) => a.reading_date.localeCompare(b.reading_date))
  const data = sorted.map((r, i) => ({ i, gravity: parseFloat(r.gravity) }))

  const gravities = data.map(d => d.gravity)
  const tFg = targetFg ? parseFloat(targetFg) : null
  const minG = Math.min(...gravities, tFg ?? Infinity) - 0.002
  const maxG = Math.max(...gravities) + 0.002
  const latestG = gravities.at(-1)
  const isNearTarget = tFg !== null && latestG !== undefined && latestG <= tFg + 0.003
  const lineColor = isNearTarget ? '#22C55E' : '#F59E0B'

  // Re-build data with date field for tooltip using sorted readings
  const dataWithDate = sorted.map((r, i) => ({ i, gravity: parseFloat(r.gravity), date: r.reading_date }))

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={dataWithDate} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <XAxis dataKey="i" hide />
        {tFg !== null && (
          <ReferenceLine y={tFg} stroke="#D1D5DB" strokeDasharray="4 2" strokeWidth={1} />
        )}
        <Tooltip content={<SparklineTooltip unit="" />} />
        <Line
          type="monotone"
          dataKey="gravity"
          stroke={lineColor}
          strokeWidth={2}
          dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <YAxis domain={[minG, maxG]} hide />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── MiniTempSparkline ────────────────────────────────────────────────────────
// Compact temperature trend chart for the vessel card. Only renders when at
// least 2 temperature readings exist.

function MiniTempSparkline({ readings }) {
  const tempReadings = readings.filter(r => r.temperature != null)
  if (tempReadings.length < 2) return null

  const sorted = [...tempReadings].sort((a, b) => a.reading_date.localeCompare(b.reading_date))
  const data   = sorted.map((r, i) => ({ i, temp: parseFloat(r.temperature), date: r.reading_date }))
  const latest = data.at(-1)
  const temps  = data.map(d => d.temp)
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)

  return (
    <div className="mt-3">
      <div className="flex justify-between items-center mb-1">
        <p className="text-[11px] text-gray-400">Temperature</p>
        {latest && (
          <p className="text-[11px] font-semibold text-blue-600">
            {latest.temp.toFixed(1)}°F
          </p>
        )}
      </div>
      <ResponsiveContainer width="100%" height={50}>
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <XAxis dataKey="i" hide />
          <YAxis hide domain={[Math.floor(minTemp) - 1, Math.ceil(maxTemp) + 1]} />
          <Tooltip content={<SparklineTooltip unit="°F" />} />
          <Line
            type="monotone"
            dataKey="temp"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 2, fill: '#3B82F6', strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── GravityChart ─────────────────────────────────────────────────────────────
// Full-size recharts chart for the detail view. Shows actual readings, target FG
// reference line, and a projected trend line extrapolated from recent readings.

function GravityChart({ readings, fermentation, height = 320 }) {
  const pitchDate = fermentation?.pitch_date ? new Date(fermentation.pitch_date + 'T00:00:00') : null
  const tFg = fermentation?.target_fg ? parseFloat(fermentation.target_fg) : null

  // Stage boundary days (days since pitch) for vertical divider lines and dot coloring
  const conditioningDay = fermentation?.conditioning_start_date && pitchDate
    ? Math.round((new Date(fermentation.conditioning_start_date + 'T00:00:00') - pitchDate) / 86400000)
    : null
  const lageringDay = fermentation?.lagering_start_date && pitchDate
    ? Math.round((new Date(fermentation.lagering_start_date + 'T00:00:00') - pitchDate) / 86400000)
    : null

  // Convert readings to chart data points keyed by days-since-pitch
  const actual = readings.map(r => ({
    day:     pitchDate ? Math.round((new Date(r.reading_date + 'T00:00:00') - pitchDate) / 86400000) : 0,
    gravity: parseFloat(r.gravity),
  }))

  // Calculate a simple linear projection from the last two readings
  const projected = []
  if (actual.length >= 2 && tFg !== null) {
    const last  = actual.at(-1)
    const prev  = actual.at(-2)
    const dayDelta = (last.day ?? 1) - (prev.day ?? 0)
    const gravDelta = last.gravity - prev.gravity
    if (dayDelta > 0 && gravDelta < 0) {
      const ratePerDay = gravDelta / dayDelta
      let g = last.gravity
      let d = last.day ?? 0
      for (let i = 0; i < 21; i++) {
        d += 1
        g = Math.max(g + ratePerDay, tFg)
        projected.push({ day: d, projected: parseFloat(g.toFixed(4)) })
        if (g <= tFg) break
      }
    }
  }

  // Merge actual and projected onto a single day-keyed array
  const dayMap = {}
  actual.forEach(p  => { dayMap[p.day] = { ...dayMap[p.day], day: p.day, gravity: p.gravity } })
  projected.forEach(p => { dayMap[p.day] = { ...dayMap[p.day], day: p.day, projected: p.projected } })
  // Connect the lines by adding the last actual value at the start of the projection
  if (projected.length > 0 && actual.length > 0) {
    const last = actual.at(-1)
    dayMap[last.day] = { ...dayMap[last.day], projected: last.gravity }
  }
  const chartData = Object.values(dayMap).sort((a, b) => (a.day ?? 0) - (b.day ?? 0))

  const allG = [...actual.map(p => p.gravity), ...projected.map(p => p.projected), tFg].filter(v => v != null)
  const minG = Math.min(...allG) - 0.003
  const maxG = Math.max(...allG) + 0.003

  if (readings.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg" style={{ height }}>
        <p className="text-sm text-gray-400">No gravity readings yet. Log the first reading to see the chart.</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis
          dataKey="day"
          tickFormatter={v => `D${v}`}
          label={{ value: 'Days since pitch', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#9CA3AF' }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[minG, maxG]}
          tickFormatter={v => v.toFixed(3)}
          tick={{ fontSize: 11 }}
          width={55}
        />
        <Tooltip
          formatter={(v, name) => [v?.toFixed(3), name === 'gravity' ? 'Gravity' : 'Projected']}
          labelFormatter={d => `Day ${d}`}
          contentStyle={{ fontSize: 12 }}
        />
        {tFg !== null && (
          <ReferenceLine
            y={tFg}
            stroke="#9CA3AF"
            strokeDasharray="6 3"
            label={{ value: `Target FG: ${tFg.toFixed(3)}`, position: 'right', fontSize: 10, fill: '#9CA3AF' }}
          />
        )}
        {conditioningDay !== null && (
          <ReferenceLine
            x={conditioningDay}
            stroke="#3B82F6"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: '→ Conditioning', position: 'top', fontSize: 9, fill: '#3B82F6' }}
          />
        )}
        {lageringDay !== null && (
          <ReferenceLine
            x={lageringDay}
            stroke="#6366F1"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: '→ Lagering', position: 'top', fontSize: 9, fill: '#6366F1' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="gravity"
          stroke="#F59E0B"
          strokeWidth={2.5}
          dot={(props) => {
            const { cx, cy, payload } = props
            const color =
              lageringDay !== null && payload.day >= lageringDay ? '#6366F1' :
              conditioningDay !== null && payload.day >= conditioningDay ? '#3B82F6' :
              '#F59E0B'
            return <circle key={payload.day} cx={cx} cy={cy} r={4} fill={color} />
          }}
          connectNulls={false}
          isAnimationActive={false}
          name="Actual"
        />
        <Line
          type="monotone"
          dataKey="projected"
          stroke="#CBD5E1"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
          name="Projected"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── VesselCard ───────────────────────────────────────────────────────────────
// One card per vessel. Shows the SVG tank, active fermentation info, mini chart,
// and action buttons.

function VesselCard({ vessel, fermentation, readings, onLogReading, onViewDetail, onAssignEmpty, isReadOnly }) {
  const status = fermentation ? fermentation.status : 'empty'

  // Fixed fill level: 75% for any active fermentation, 0% when empty/packaged/dumped
  const ACTIVE_STATUSES = new Set(['fermenting', 'conditioning', 'lagering', 'ready_to_package'])
  const fillPct = ACTIVE_STATUSES.has(status) ? 75 : 0

  // Days since yeast was pitched — clamped to 0 so future pitch dates don't show negative
  const daysFermenting = fermentation?.pitch_date
    ? Math.max(0, Math.floor((new Date() - new Date(fermentation.pitch_date + 'T00:00:00')) / 86400000))
    : null

  const latestReading = readings.at(-1) ?? null

  // Apparent attenuation: (OG - current) / (OG - 1.000) × 100
  const attenuation = useMemo(() => {
    if (!fermentation?.actual_og || !latestReading) return null
    const og = parseFloat(fermentation.actual_og)
    const fg = parseFloat(latestReading.gravity)
    return Math.round(((og - fg) / (og - 1.0)) * 100)
  }, [fermentation?.actual_og, latestReading])

  // Dry hop alert — scheduled, not completed, date has passed or is today
  const dryHopAlert = fermentation?.dry_hop_scheduled
    && !fermentation?.dry_hop_completed
    && fermentation?.dry_hop_date
    && fermentation.dry_hop_date <= new Date().toISOString().slice(0, 10)

  const today = new Date().toISOString().slice(0, 10)

  // Red: no gravity reading in last 3 days (only warn if fermenting/conditioning/lagering)
  const ACTIVE_WARN_STATUSES = new Set(['fermenting', 'conditioning', 'lagering'])
  const needsGravityReading = ACTIVE_WARN_STATUSES.has(status) && (() => {
    if (readings.length === 0) return true
    const latestDate = readings.reduce((max, r) => r.reading_date > max ? r.reading_date : max, '')
    const daysSince = Math.floor((new Date(today) - new Date(latestDate + 'T00:00:00')) / 86400000)
    return daysSince >= 3
  })()

  // Red: fermenting for 21+ days with no FG target reached
  const pastFermentationLimit = status === 'fermenting' && fermentation?.pitch_date && (() => {
    const days = Math.floor((new Date(today) - new Date(fermentation.pitch_date + 'T00:00:00')) / 86400000)
    return days >= 21
  })()

  // Card border color reflects fermentation status
  const cardBorder =
    status === 'fermenting'       ? 'border-amber shadow-sm' :
    status === 'ready_to_package' ? 'border-green-400' :
    status === 'conditioning'     ? 'border-blue-200' :
    status === 'lagering'         ? 'border-indigo-200' :
    'border-gray-200'

  return (
    <div className={`bg-white rounded-xl border ${cardBorder} p-4 flex flex-col`}>

      {/* Top row: vessel info + status badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-bold text-navy text-sm truncate">{vessel.vessel_name}</h3>
          <p className="text-[11px] text-gray-400 truncate">
            {vessel.vessel_type}
            {vessel.capacity ? ` · ${vessel.capacity} ${vessel.capacity_unit}` : ''}
            {vessel.has_temperature_control ? ' · TC' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {fermentation && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          )}
          {needsGravityReading && (
            <span
              className="w-2 h-2 rounded-full bg-danger inline-block shrink-0"
              title="No gravity reading in 3+ days"
            />
          )}
          {pastFermentationLimit && (
            <span
              className="w-2 h-2 rounded-full bg-danger inline-block shrink-0"
              title="Fermenting past 21 days — consider checking final gravity"
            />
          )}
          {dryHopAlert && (
            <span
              className="w-2 h-2 rounded-full bg-amber inline-block shrink-0"
              title="Dry hop date has passed — mark completed"
            />
          )}
        </div>
      </div>

      {/* Active batch info */}
      {fermentation && (
        <div className="mb-2">
          <p className="font-bold text-navy truncate">{fermentation.beer_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {fermentation.batch_number && (
              <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded font-bold">
                {fermentation.batch_number}
              </span>
            )}
            {daysFermenting !== null && (
              <span className="text-[11px] text-gray-500">Day {daysFermenting}</span>
            )}
          </div>
        </div>
      )}

      {/* SVG tank illustration — centered */}
      <div className="flex justify-center items-center py-2">
        <TankSVG uid={vessel.id} fillPct={fillPct} status={status} vesselType={vessel.vessel_type} />
      </div>

      {/* Gravity chart + stats — shown for assigned fermentations */}
      {fermentation && status !== 'pending_assignment' && (
        <div className="mt-2">
          <MiniSparkline
            readings={readings}
            targetFg={fermentation.target_fg}
            fermentation={fermentation}
          />
          <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
            <span>Target FG: {fermentation.target_fg ? parseFloat(fermentation.target_fg).toFixed(3) : '—'}</span>
            {latestReading && (
              <span>Latest: {parseFloat(latestReading.gravity).toFixed(3)}</span>
            )}
          </div>
          {attenuation !== null && (
            <p className="text-[11px] text-gray-500">{attenuation}% attenuated</p>
          )}
          <MiniTempSparkline readings={readings} />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto pt-3">
        {!fermentation ? (
          <button
            onClick={onAssignEmpty}
            disabled={isReadOnly}
            className="flex-1 text-xs bg-amber hover:bg-amber-dark text-white rounded-lg py-2 font-semibold transition-colors disabled:opacity-50"
          >
            Assign Batch
          </button>
        ) : (
          <>
            <button
              onClick={() => onLogReading(fermentation)}
              disabled={isReadOnly}
              className="flex-1 text-xs bg-amber hover:bg-amber-dark text-white rounded-lg py-2 font-semibold transition-colors disabled:opacity-50"
            >
              Log Reading
            </button>
            <button
              onClick={() => onViewDetail(fermentation)}
              className="flex-1 text-xs border border-gray-300 text-gray-700 rounded-lg py-2 hover:bg-gray-50 transition-colors"
            >
              View Details
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── LogReadingModal ──────────────────────────────────────────────────────────
// Quick gravity entry modal — accessible from vessel card or detail tab.

function LogReadingModal({ fermentation, onClose, onSaved }) {
  const { brewery } = useAuth()
  const draft = useModalDraft('modal_draft_gravity_reading')

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => {
    const saved = draft.loadDraft()
    return saved ?? { date: today, gravity: '', temperature: '', notes: '', reading_type: 'gravity' }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    console.log('[LogReadingModal] ModalShell + useModalDraft active')
  }, [])

  // Persist draft to sessionStorage whenever the form changes
  useEffect(() => { draft.saveDraft(form) }, [form])

  async function handleSave() {
    const g = parseFloat(form.gravity)
    if (!form.gravity || isNaN(g) || g < 0.99 || g > 1.2) {
      setError('Enter a valid gravity between 0.990 and 1.200')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('gravity_readings').insert({
      fermentation_id: fermentation.id,
      brewery_id:      brewery.id,
      reading_date:    form.date || today,
      gravity:         g,
      temperature:     form.temperature ? parseFloat(form.temperature) : null,
      notes:           form.notes.trim() || null,
      reading_type:    form.reading_type,
    })
    if (err) { setError(err.message); setSaving(false); return }
    draft.clearDraft()
    onSaved()
  }

  const isDirty = !!(form.gravity || form.temperature || form.notes)

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Log Gravity Reading — ${fermentation.beer_name}`}
      isDirty={isDirty}
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Date</label>
            <input type="date" className={INPUT_CLS}
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
            />
          </div>
          <div>
            <label className={LBL}>Reading type</label>
            <select className={INPUT_CLS}
              value={form.reading_type}
              onChange={e => setForm(p => ({ ...p, reading_type: e.target.value }))}
            >
              <option value="gravity">Gravity</option>
              <option value="pH">pH</option>
              <option value="dissolved_oxygen">Dissolved Oxygen</option>
              <option value="turbidity">Turbidity</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Gravity (required)</label>
            <input type="number" step="0.001" min="0.990" max="1.200" placeholder="1.048"
              className={INPUT_CLS}
              value={form.gravity}
              onChange={e => { setError(''); setForm(p => ({ ...p, gravity: e.target.value })) }}
            />
          </div>
          <div>
            <label className={LBL}>Temperature °F (optional)</label>
            <input type="number" step="0.1" placeholder="68"
              className={INPUT_CLS}
              value={form.temperature}
              onChange={e => setForm(p => ({ ...p, temperature: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className={LBL}>Notes (optional)</label>
          <textarea rows={2} placeholder="Appearance, aroma, transfer notes..."
            className={INPUT_CLS}
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>

        {fermentation.target_fg && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Target FG: <strong>{parseFloat(fermentation.target_fg).toFixed(3)}</strong>
            {form.gravity && parseFloat(form.gravity) > 0 && (
              <>
                {' · '}
                {parseFloat(form.gravity) <= parseFloat(fermentation.target_fg) + 0.003
                  ? <span className="text-success font-medium">At / near target ✓</span>
                  : <span className="text-gray-600">Still attenuating</span>
                }
              </>
            )}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Reading'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── AssignVesselModal ────────────────────────────────────────────────────────
// Links a pending fermentation to an empty vessel, sets status to 'fermenting'.

function AssignVesselModal({ preSelectedFermentation, preSelectedVessel, fermentations, vessels, onClose, onAssigned }) {
  const { brewery } = useAuth()
  const { loadDraft, saveDraft, clearDraft } = useModalDraft('modal_draft_fermentation_assign_vessel')

  const initialFermId   = preSelectedFermentation?.id ?? (fermentations[0]?.id ?? '')
  const initialVesselId = preSelectedVessel?.id        ?? (vessels[0]?.id       ?? '')

  const [fermId,   setFermId]   = useState(() => { const d = loadDraft(false); return d?.fermId   ?? initialFermId   })
  const [vesselId, setVesselId] = useState(() => { const d = loadDraft(false); return d?.vesselId ?? initialVesselId })
  const [saving, setSaving]     = useState(false)
  const [error,  setError]      = useState('')

  useEffect(() => {
    console.log('[AssignVesselModal] ModalShell + useModalDraft active')
  }, [])

  async function handleAssign() {
    if (!fermId)   { setError('Select a fermentation batch.'); return }
    if (!vesselId) { setError('Select a vessel.'); return }
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)

    // Fetch fermentation to check pitch_date, volume, volume_unit, and brew_day link
    const { data: f } = await supabase
      .from('fermentations')
      .select('pitch_date, brew_day_id, volume_in_fermenter, volume_unit')
      .eq('id', fermId)
      .single()

    const update = {
      vessel_id: vesselId,
      status:    'fermenting',
      ...(!f?.pitch_date && { pitch_date: today }),
    }

    // If volume is missing but a brew day is linked, pull volume_into_fermenter from the brew day
    const hasVolume = f?.volume_in_fermenter != null && parseFloat(f.volume_in_fermenter) > 0
    if (!hasVolume && f?.brew_day_id) {
      const { data: bd } = await supabase
        .from('brew_days')
        .select('volume_into_fermenter, planned_batch_unit')
        .eq('id', f.brew_day_id)
        .maybeSingle()
      if (bd?.volume_into_fermenter != null) {
        update.volume_in_fermenter = bd.volume_into_fermenter
        if (bd.planned_batch_unit) update.volume_unit = bd.planned_batch_unit
      }
    }

    // Capacity check — convert both volumes to barrels before comparing
    const bbl = (val, unit) => {
      const v = parseFloat(val)
      if (!v) return 0
      const u = (unit || 'barrels').toLowerCase()
      if (u === 'gallons' || u === 'gallon') return v / 31
      if (u === 'liters' || u === 'litres' || u === 'l') return v / 117.35
      return v // assume barrels
    }
    const vessel    = vessels.find(v => v.id === vesselId)
    const batchVol  = update.volume_in_fermenter ?? f?.volume_in_fermenter
    const batchUnit = update.volume_unit          ?? f?.volume_unit
    if (vessel?.capacity && batchVol) {
      const batchBbl  = bbl(batchVol, batchUnit)
      const vesselBbl = bbl(vessel.capacity, vessel.capacity_unit)
      console.log('[handleAssign] capacity check', {
        vessel: vessel.vessel_name,
        vesselCapacity: `${vessel.capacity} ${vessel.capacity_unit}`,
        vesselBbl,
        batchVolume: `${batchVol} ${batchUnit}`,
        batchBbl,
      })
      if (batchBbl > vesselBbl) {
        setError(
          `Cannot assign — batch is ${batchBbl.toFixed(2)} bbl but ${vessel.vessel_name} only holds ${vesselBbl.toFixed(2)} bbl. Please select a larger vessel.`
        )
        setSaving(false)
        return
      }
    }

    const { error: err } = await supabase.from('fermentations').update(update).eq('id', fermId)
    if (err) { setError(err.message); setSaving(false); return }
    clearDraft()
    onAssigned()
  }

  return (
    <ModalShell isOpen onClose={onClose} title="Assign Vessel" maxWidth="max-w-md">
      <div className="space-y-4 pt-2">
        {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {fermentations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No batches awaiting assignment. All fermentations have vessels assigned.
          </p>
        ) : (
          <>
            <div>
              <label className={LBL}>Fermentation batch</label>
              <select className={INPUT_CLS} value={fermId} onChange={e => { setFermId(e.target.value); saveDraft({ fermId: e.target.value, vesselId }) }}>
                {fermentations.map(f => (
                  <option key={f.id} value={f.id}>{fermLabel(f)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LBL}>Vessel</label>
              {vessels.length === 0 ? (
                <p className="text-xs text-amber">No empty vessels available. All vessels have active fermentations.</p>
              ) : (
                <select className={INPUT_CLS} value={vesselId} onChange={e => { setVesselId(e.target.value); saveDraft({ fermId, vesselId: e.target.value }) }}>
                  {vessels.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.vessel_name} — {v.vessel_type}{v.capacity ? ` (${v.capacity} ${v.capacity_unit})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <p className="text-xs text-gray-500 bg-amber/5 rounded-lg px-3 py-2">
              Assigning will set the fermentation status to <strong>Fermenting</strong> and record today as the pitch date if not already set.
            </p>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={saving || vessels.length === 0}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Assigning...' : 'Assign Vessel'}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// ─── ManageVesselsModal ───────────────────────────────────────────────────────
// Lists all vessels with edit/deactivate, and an inline add form.

function ManageVesselsModal({ vessels, onClose, onChanged }) {
  const { brewery } = useAuth()
  const vesselDraft = useModalDraft('modal_draft_fermentation_add_vessel')

  const emptyForm = { vessel_name: '', vessel_type: 'Conical Fermenter', capacity: '', capacity_unit: 'barrels', has_temperature_control: false, location: '', notes: '' }
  const [editing, setEditing]   = useState(null)  // vessel object being edited, or null for new
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [savingOrder, setSavingOrder] = useState(false)

  useEffect(() => {
    console.log('[ManageVesselsModal] ModalShell + useModalDraft active')
  }, [])

  // Persist add-vessel form to sessionStorage whenever form changes (add mode only)
  useEffect(() => {
    if (showAdd && !editing) vesselDraft.saveDraft(form)
  }, [form, showAdd, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open the add form — restore any saved draft
  function openAdd() {
    setEditing(null)
    const draft = vesselDraft.loadDraft(false)
    setForm(draft ?? emptyForm)
    setShowAdd(true)
    setError('')
  }

  // Open edit form for an existing vessel
  function openEdit(v) {
    setEditing(v)
    setForm({
      vessel_name:             v.vessel_name ?? '',
      vessel_type:             v.vessel_type ?? 'Conical Fermenter',
      capacity:                v.capacity ?? '',
      capacity_unit:           v.capacity_unit ?? 'barrels',
      has_temperature_control: v.has_temperature_control ?? false,
      location:                v.location ?? '',
      notes:                   v.notes ?? '',
    })
    setShowAdd(true)
    setError('')
  }

  // Save new vessel or update existing
  async function handleSave() {
    if (!form.vessel_name.trim()) { setError('Vessel name is required.'); return }
    setSaving(true)
    const payload = {
      vessel_name:             form.vessel_name.trim(),
      vessel_type:             form.vessel_type,
      capacity:                form.capacity !== '' ? parseFloat(form.capacity) : null,
      capacity_unit:           form.capacity_unit,
      has_temperature_control: form.has_temperature_control,
      location:                form.location.trim() || null,
      notes:                   form.notes.trim() || null,
    }
    let err
    if (editing) {
      ;({ error: err } = await supabase.from('fermentation_vessels').update(payload).eq('id', editing.id))
    } else {
      const maxOrder = vessels.length > 0 ? Math.max(...vessels.map(v => v.sort_order ?? 0)) : -1
      ;({ error: err } = await supabase.from('fermentation_vessels').insert({
        ...payload, brewery_id: brewery.id, sort_order: maxOrder + 1,
      }))
    }
    if (err) { setError(err.message); setSaving(false); return }
    if (!editing) vesselDraft.clearDraft()
    setShowAdd(false)
    setSaving(false)
    onChanged()
  }

  // Deactivate a vessel (soft delete — hides from dashboard but preserves history)
  async function handleDeactivate(v) {
    if (!window.confirm(`Deactivate "${v.vessel_name}"? It will be hidden from the dashboard but its history is preserved.`)) return
    await supabase.from('fermentation_vessels').update({ is_active: false }).eq('id', v.id)
    onChanged()
  }

  // Move a vessel up or down in the sort order
  async function moveVessel(idx, dir) {
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= vessels.length) return
    setSavingOrder(true)
    await Promise.all([
      supabase.from('fermentation_vessels').update({ sort_order: vessels[swapIdx].sort_order }).eq('id', vessels[idx].id),
      supabase.from('fermentation_vessels').update({ sort_order: vessels[idx].sort_order }).eq('id', vessels[swapIdx].id),
    ])
    setSavingOrder(false)
    onChanged()
  }

  const isDirty = form.vessel_name !== '' || form.capacity !== '' || form.location !== '' || form.notes !== ''

  return (
    <ModalShell isOpen onClose={onClose} title="Manage Vessels" isDirty={showAdd && isDirty} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-2">

        {/* Vessel list */}
        {!showAdd && (
          <>
            {vessels.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No vessels configured yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {vessels.map((v, idx) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveVessel(idx, -1)} disabled={idx === 0 || savingOrder}
                        className="text-gray-300 hover:text-gray-500 text-xs leading-none disabled:opacity-30">▲</button>
                      <button onClick={() => moveVessel(idx, 1)} disabled={idx === vessels.length - 1 || savingOrder}
                        className="text-gray-300 hover:text-gray-500 text-xs leading-none disabled:opacity-30">▼</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm">{v.vessel_name}</p>
                      <p className="text-xs text-gray-400">
                        {v.vessel_type}
                        {v.capacity ? ` · ${v.capacity} ${v.capacity_unit}` : ''}
                        {v.has_temperature_control ? ' · Temp control' : ''}
                        {v.location ? ` · ${v.location}` : ''}
                      </p>
                    </div>
                    <button onClick={() => openEdit(v)} className="text-xs text-amber hover:underline shrink-0">Edit</button>
                    <button onClick={() => handleDeactivate(v)} className="text-xs text-gray-400 hover:text-danger shrink-0">Deactivate</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={openAdd}
              className="w-full border-2 border-dashed border-amber/40 text-amber font-semibold rounded-xl py-3 text-sm hover:bg-amber/5 transition-colors">
              + Add Vessel
            </button>
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
          </>
        )}

        {/* Add / edit form */}
        {showAdd && (
          <>
            <h4 className="font-semibold text-navy text-sm">{editing ? `Edit ${editing.vessel_name}` : 'Add New Vessel'}</h4>
            {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div>
              <label className={LBL}>Vessel name (required)</label>
              <input className={INPUT_CLS} placeholder="Fermenter 1" value={form.vessel_name}
                onChange={e => { setError(''); setForm(p => ({ ...p, vessel_name: e.target.value })) }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Vessel type</label>
                <select className={INPUT_CLS} value={form.vessel_type}
                  onChange={e => setForm(p => ({ ...p, vessel_type: e.target.value }))}>
                  {VESSEL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Location (optional)</label>
                <input className={INPUT_CLS} placeholder="Cellar" value={form.location}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Capacity</label>
                <input type="number" step="0.1" className={INPUT_CLS} placeholder="7" value={form.capacity}
                  onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} />
              </div>
              <div>
                <label className={LBL}>Capacity unit</label>
                <select className={INPUT_CLS} value={form.capacity_unit}
                  onChange={e => setForm(p => ({ ...p, capacity_unit: e.target.value }))}>
                  <option value="barrels">Barrels</option>
                  <option value="gallons">Gallons</option>
                </select>
              </div>
            </div>

            <div>
              <label className={LBL}>Notes (optional)</label>
              <textarea rows={2} className={INPUT_CLS} value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.has_temperature_control}
                onChange={e => setForm(p => ({ ...p, has_temperature_control: e.target.checked }))}
                className="w-4 h-4 accent-amber" />
              <span className="text-sm text-gray-700">Temperature control available</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Add Vessel')}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// ─── AddFermentationModal ─────────────────────────────────────────────────────
// Create a fermentation manually, not linked to a brew day.

function AddFermentationModal({ onClose, onSaved }) {
  const { brewery } = useAuth()
  const draft = useModalDraft('modal_draft_add_fermentation')

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => {
    const saved = draft.loadDraft()
    return saved ?? {
      beer_name: '', beer_style: '', batch_number: '', fermentation_type: 'standard',
      volume_in_fermenter: '', volume_unit: 'barrels',
      target_og: '', target_fg: '', target_abv: '',
      yeast_strain: '', yeast_generation: '1',
      pitch_date: today, pitch_temp: '', fermentation_temp_target: '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    console.log('[AddFermentationModal] ModalShell + useModalDraft active')
  }, [])

  useEffect(() => { draft.saveDraft(form) }, [form])

  const f = (field) => ({ value: form[field] ?? '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })

  async function handleSave() {
    if (!form.beer_name.trim()) { setError('Beer name is required.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('fermentations').insert({
      brewery_id:              brewery.id,
      beer_name:               form.beer_name.trim(),
      beer_style:              form.beer_style.trim() || null,
      batch_number:            form.batch_number.trim() || null,
      status:                  'pending_assignment',
      fermentation_type:       form.fermentation_type,
      volume_in_fermenter:     form.volume_in_fermenter !== '' ? parseFloat(form.volume_in_fermenter) : null,
      volume_unit:             form.volume_unit,
      target_og:               form.target_og !== '' ? parseFloat(form.target_og) : null,
      target_fg:               form.target_fg !== '' ? parseFloat(form.target_fg) : null,
      target_abv:              form.target_abv !== '' ? parseFloat(form.target_abv) : null,
      yeast_strain:            form.yeast_strain.trim() || null,
      yeast_generation:        form.yeast_generation !== '' ? parseInt(form.yeast_generation) : 1,
      pitch_date:              form.pitch_date || null,
      pitch_temp:              form.pitch_temp !== '' ? parseFloat(form.pitch_temp) : null,
      fermentation_temp_target: form.fermentation_temp_target !== '' ? parseFloat(form.fermentation_temp_target) : null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    draft.clearDraft()
    onSaved()
  }

  const isDirty = !!(form.beer_name || form.volume_in_fermenter || form.yeast_strain)

  return (
    <ModalShell
      isOpen onClose={onClose} title="Add Fermentation"
      isDirty={isDirty} draftRestored={draft.draftRestored} onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 pt-2">
        {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={LBL}>Beer name (required)</label>
            <input className={INPUT_CLS} placeholder="Hoppy IPA" {...f('beer_name')}
              onChange={e => { setError(''); setForm(p => ({ ...p, beer_name: e.target.value })) }} />
          </div>
          <div>
            <label className={LBL}>Beer style</label>
            <input className={INPUT_CLS} placeholder="West Coast IPA" {...f('beer_style')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Batch number</label>
            <input className={INPUT_CLS} placeholder="B-2024-042" {...f('batch_number')} />
          </div>
          <div>
            <label className={LBL}>Fermentation type</label>
            <select className={INPUT_CLS} {...f('fermentation_type')}>
              {Object.entries(FERM_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Volume in fermenter</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="7" {...f('volume_in_fermenter')} />
          </div>
          <div>
            <label className={LBL}>Volume unit</label>
            <select className={INPUT_CLS} {...f('volume_unit')}>
              <option value="barrels">Barrels</option>
              <option value="gallons">Gallons</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LBL}>Target OG</label>
            <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.065" {...f('target_og')} />
          </div>
          <div>
            <label className={LBL}>Target FG</label>
            <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.012" {...f('target_fg')} />
          </div>
          <div>
            <label className={LBL}>Target ABV %</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="6.9" {...f('target_abv')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Yeast strain</label>
            <input className={INPUT_CLS} placeholder="WY1056" {...f('yeast_strain')} />
          </div>
          <div>
            <label className={LBL}>Yeast generation</label>
            <input type="number" min="1" className={INPUT_CLS} placeholder="1" {...f('yeast_generation')} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LBL}>Pitch date</label>
            <input type="date" className={INPUT_CLS} {...f('pitch_date')} />
          </div>
          <div>
            <label className={LBL}>Pitch temp °F</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="65" {...f('pitch_temp')} />
          </div>
          <div>
            <label className={LBL}>Ferm temp target °F</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="68" {...f('fermentation_temp_target')} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Fermentation'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── FermentationDetailModal ──────────────────────────────────────────────────
// Full detail view with four tabs: Overview, Gravity Log, Dry Hop, Notes.

function FermentationDetailModal({ fermentation: initialFerm, vessels, availableVessels, readings: initialReadings, onClose, onUpdated, onReadingChanged }) {
  const { brewery } = useAuth()
  const { isReadOnly } = useReadOnly()

  const [ferm, setFerm]         = useState(initialFerm)
  const [readings, setReadings] = useState(initialReadings)
  const [tab, setTab]           = usePersistedTab('fermentation_detail_tab', 'overview')
  const [saveStatus, setSaveStatus]     = useState(null) // null | 'saving' | 'saved'
  const [statusChanging, setStatusChanging] = useState(false)
  const [statusError, setStatusError]   = useState('')
  const [statusNote, setStatusNote]     = useState('')
  const [showVesselChange, setShowVesselChange] = useState(false)
  const [reassignSuccess, setReassignSuccess]   = useState('')
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState({ date: new Date().toISOString().slice(0, 10), gravity: '', temperature: '', notes: '' })
  const [logError, setLogError] = useState('')
  const [editingReading, setEditingReading] = useState(null)
  const [editReadingForm, setEditReadingForm] = useState({ date: '', gravity: '', temperature: '', notes: '' })
  const [editReadingError, setEditReadingError] = useState('')

  // Part 2B: brew day yeast strain fallback
  const [brewDayYeastStrain, setBrewDayYeastStrain] = useState(null)

  // Part 2D: stage settings form state
  const [stageFormOpen, setStageFormOpen] = useState(false)  // 'conditioning' | 'lagering' | false
  const [stageForm, setStageForm] = useState({ temp_target: '', duration_days: '', notes: '' })
  const [pendingStatus, setPendingStatus] = useState(null)

  // Stage History collapse state — all open by default
  const [stageCollapse, setStageCollapse] = useState({ primary: true, conditioning: true, lagering: true })

  // Reload readings when the log changes externally (e.g. from vessel card Log Reading button)
  useEffect(() => { setReadings(initialReadings) }, [initialReadings])

  // Part 2B: fetch yeast strain from brew day when ferm has no yeast_strain but has brew_day_id
  useEffect(() => {
    if (!ferm?.yeast_strain && ferm?.brew_day_id) {
      supabase
        .from('brew_days')
        .select('yeast_strain')
        .eq('id', ferm.brew_day_id)
        .single()
        .then(({ data: bd }) => {
          setBrewDayYeastStrain(bd?.yeast_strain ?? null)
        })
    } else {
      setBrewDayYeastStrain(null)
    }
  }, [ferm?.brew_day_id, ferm?.yeast_strain])

  // Auto-save a single field to the fermentations table
  async function saveField(field, rawValue) {
    if (!ferm?.id || isReadOnly) return
    const value = rawValue === '' ? null : rawValue
    setSaveStatus('saving')
    const { error } = await supabase.from('fermentations').update({ [field]: value }).eq('id', ferm.id)
    if (error) { setSaveStatus(null); return }
    const updated = { ...ferm, [field]: value }
    setFerm(updated)
    onUpdated(updated)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 2000)
  }

  // Controlled input helper — saves on blur
  function fi(field, type = 'text') {
    return {
      value: ferm?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setFerm(p => ({ ...p, [field]: e.target.value })),
      onBlur: e => {
        const v = e.target.value.trim()
        saveField(field, type === 'number' ? (v === '' ? null : parseFloat(v)) : (v || null))
      },
    }
  }

  // Select helper — saves immediately on change
  function si(field) {
    return {
      value: ferm?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => { setFerm(p => ({ ...p, [field]: e.target.value })); saveField(field, e.target.value || null) },
    }
  }

  // Textarea helper — saves on blur
  function ti(field) {
    return {
      value: ferm?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setFerm(p => ({ ...p, [field]: e.target.value })),
      onBlur: e => saveField(field, e.target.value.trim() || null),
    }
  }

  // Save actual_fg and auto-calculate actual_abv in one DB round-trip
  async function saveActualFg(rawValue) {
    const fg = rawValue === '' ? null : parseFloat(rawValue)
    const updates = { actual_fg: fg }
    if (fg !== null && ferm.actual_og) {
      updates.actual_abv = parseFloat(((parseFloat(ferm.actual_og) - fg) * 131.25).toFixed(2))
    }
    setSaveStatus('saving')
    const { error } = await supabase.from('fermentations').update(updates).eq('id', ferm.id)
    if (error) { setSaveStatus(null); return }
    const updated = { ...ferm, ...updates }
    setFerm(updated)
    onUpdated(updated)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 2000)
  }

  // Reassign to a different vessel and show a timed success message
  async function reassignVessel(newVesselId) {
    if (isReadOnly) return
    setSaveStatus('saving')
    const { error } = await supabase.from('fermentations')
      .update({ vessel_id: newVesselId || null })
      .eq('id', ferm.id)
    if (error) { setSaveStatus(null); return }
    const updated = { ...ferm, vessel_id: newVesselId || null }
    setFerm(updated)
    onUpdated(updated)
    setSaveStatus('saved')
    setShowVesselChange(false)
    const vName = (availableVessels ?? vessels).find(v => v.id === newVesselId)?.vessel_name
    if (vName) {
      setReassignSuccess(`Vessel reassigned to ${vName}`)
      setTimeout(() => setReassignSuccess(''), 3000)
    }
    setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 2000)
  }

  // Advance to a new status — validates preconditions and fires side effects
  async function changeStatus(newStatus) {
    setStatusError('')
    setStatusNote('')

    // Part 2C: vessel assignment check and capacity validation
    if (newStatus === 'fermenting') {
      if (!ferm.vessel_id) {
        setStatusError('Assign a vessel before moving to Fermenting.')
        return
      }
      // Capacity validation — convert batch and vessel volumes to barrels for comparison
      const vessel = vessels.find(v => v.id === ferm.vessel_id)
      if (vessel?.capacity && ferm.volume_in_fermenter) {
        const bbl = (val, unit) => {
          const v = parseFloat(val)
          if (!v) return 0
          const u = (unit || 'barrels').toLowerCase()
          if (u === 'gallons' || u === 'gallon') return v / 31
          if (u === 'liters' || u === 'litres' || u === 'l') return v / 117.35
          return v // assume barrels
        }
        const batchBbl  = bbl(ferm.volume_in_fermenter, ferm.volume_unit)
        const vesselBbl = bbl(vessel.capacity, vessel.capacity_unit)
        if (batchBbl > vesselBbl) {
          setStatusError(
            `Cannot assign — batch is ${batchBbl.toFixed(2)} bbl but ${vessel.vessel_name} only holds ${vesselBbl.toFixed(2)} bbl. Please select a larger vessel.`
          )
          return
        }
      }
    }

    if (newStatus === 'conditioning' && !ferm.actual_fg) {
      setStatusError('Enter Final Gravity before moving to Conditioning.')
      return
    }

    // Part 2D: intercept conditioning/lagering to show the stage settings form
    if (newStatus === 'conditioning' || newStatus === 'lagering') {
      setStageForm({ temp_target: '', duration_days: '', notes: '' })
      setPendingStatus(newStatus)
      setStageFormOpen(newStatus)
      return  // don't proceed until form submitted
    }

    if (!window.confirm(`Move this fermentation to "${STATUS_LABELS[newStatus]}"?`)) return

    setStatusChanging(true)
    const extra = {}
    if (newStatus === 'packaged') extra.actual_packaging_date = new Date().toISOString().slice(0, 10)

    const { error } = await supabase.from('fermentations')
      .update({ status: newStatus, ...extra })
      .eq('id', ferm.id)

    if (!error) {
      const updated = { ...ferm, status: newStatus, ...extra }
      setFerm(updated)
      onUpdated(updated)

      // Part 3A: when ready to package, auto-create a packaging_runs record with recipe cost
      if (newStatus === 'ready_to_package') {
        let plannedSplits = null
        let recipeCostPerPint = null

        if (ferm.recipe_id) {
          // Same fields RecipeDetailPage's Cost Calculator uses — base_batch_size/
          // base_batch_size_unit (not batch_size_value/batch_size_unit, which don't
          // exist), plus the labor/packaging/excise/margin fields
          // calculateTrueCostPerPint expects.
          const { data: recipe, error: recipeErr } = await supabase
            .from('recipes')
            .select(`
              base_batch_size, base_batch_size_unit,
              packaging_splits, packaging_yield_percentage,
              packaging_container_type, packaging_cost_per_unit,
              label_cost_per_unit, carrier_cost_per_unit,
              brewers_count, brew_hours_per_brewer,
              packaging_hours, packaging_labor_rate,
              excise_tax_rate_per_bbl, target_margin_percentage, tax_rate
            `)
            .eq('id', ferm.recipe_id)
            .maybeSingle()

          if (recipeErr) {
            console.error('[FermentationPage] recipe fetch failed:', recipeErr)
          } else {
            if (recipe?.packaging_splits?.length > 0) plannedSplits = recipe.packaging_splits

            if (recipe) {
              // Same join RecipeDetailPage uses — recipe_ingredients has no
              // price_per_unit/cost_per_unit/category columns; cost only comes via
              // ingredients.current_price_per_unit / ingredient_suppliers.price_per_unit.
              const { data: recipeIngs, error: ingErr } = await supabase
                .from('recipe_ingredients')
                .select('amount, scale_with_batch, ingredient:ingredients(current_price_per_unit), supplier:ingredient_suppliers(price_per_unit)')
                .eq('recipe_id', ferm.recipe_id)

              if (ingErr) {
                console.error('[FermentationPage] recipe_ingredients fetch failed:', ingErr)
              } else {
                const { data: breweryRow, error: breweryErr } = await supabase
                  .from('breweries')
                  .select('labor_rate_per_hour, monthly_fixed_overhead, batches_per_month, variable_overhead_per_bbl')
                  .eq('id', brewery.id)
                  .maybeSingle()

                if (breweryErr) {
                  console.error('[FermentationPage] breweries fetch failed:', breweryErr)
                } else {
                  const defaultSize = DEFAULT_SIZE_BY_TYPE[recipe.packaging_container_type]
                  const recipeForCost = {
                    base_batch_size:            recipe.base_batch_size,
                    base_batch_size_unit:       recipe.base_batch_size_unit,
                    packaging_splits:           recipe.packaging_splits,
                    packaging_yield_percentage: recipe.packaging_yield_percentage,
                    default_size_oz:            defaultSize?.ozPerUnit,
                    default_size_bbl:           defaultSize?.bblPerUnit,
                    packaging_cost_per_unit:    recipe.packaging_cost_per_unit,
                    label_cost_per_unit:        recipe.label_cost_per_unit,
                    carrier_cost_per_unit:      recipe.carrier_cost_per_unit,
                    brewers_count:              recipe.brewers_count,
                    brew_hours_per_brewer:      recipe.brew_hours_per_brewer,
                    packaging_hours:            recipe.packaging_hours,
                    packaging_labor_rate:       recipe.packaging_labor_rate,
                    excise_tax_rate_per_bbl:    recipe.excise_tax_rate_per_bbl,
                    target_margin_percentage:   recipe.target_margin_percentage,
                    tax_rate:                   recipe.tax_rate,
                  }
                  const ingredientLines = (recipeIngs ?? []).map(l => ({
                    amount:           parseFloat(l.amount) || 0,
                    scale_with_batch: l.scale_with_batch,
                    price_per_unit:   parseFloat(l.supplier?.price_per_unit ?? l.ingredient?.current_price_per_unit ?? 0),
                  }))
                  const breweryContext = {
                    laborRatePerHour:       breweryRow?.labor_rate_per_hour,
                    monthlyFixedOverhead:   breweryRow?.monthly_fixed_overhead,
                    batchesPerMonth:        breweryRow?.batches_per_month,
                    variableOverheadPerBbl: breweryRow?.variable_overhead_per_bbl,
                  }

                  // recipe_cost_per_pint is the planning baseline — run-independent, at
                  // the recipe's own base_batch_size (no opts), not this fermentation's
                  // actual volume. PackagingRunDetailPage's handleMarkComplete never
                  // overwrites it, so whatever's written here is what this field holds
                  // for the run's whole lifetime; the run-specific realized cost lives
                  // in actual_cost_per_pint instead, computed fresh at completion.
                  const result = calculateTrueCostPerPint(recipeForCost, ingredientLines, breweryContext)
                  if (result.trueCostPerPint > 0) recipeCostPerPint = result.trueCostPerPint
                }
              }
            }
          }
        }

        const pkgRunPayload = {
          brewery_id:            brewery.id,
          fermentation_id:       ferm.id,
          batch_number:          ferm.batch_number ?? `Batch-${new Date().toISOString().slice(0, 10)}`,
          beer_name:             ferm.beer_name ?? ferm.batch_number ?? 'Unnamed Batch',
          beer_style:            ferm.beer_style ?? null,
          packaging_date:        new Date().toISOString().slice(0, 10),
          volume_from_fermenter: ferm.volume_in_fermenter ?? null,
          volume_unit:           ferm.volume_unit ?? 'barrels',
          planned_splits:        plannedSplits,
          recipe_cost_per_pint:  recipeCostPerPint,
          status:                'planned',
        }
        console.log('[FermentationPage] Creating packaging_runs record:', pkgRunPayload)
        await supabase.from('packaging_runs').insert(pkgRunPayload)
        setStatusNote('ready_to_package')
        setTimeout(() => setStatusNote(''), 8000)
      }
    }
    setStatusChanging(false)
  }

  // Part 2D: confirm transition to conditioning/lagering after stage form is submitted
  async function confirmStageTransition() {
    const ns = pendingStatus
    setStageFormOpen(false)
    setPendingStatus(null)
    setStatusChanging(true)

    const prefix = ns === 'conditioning' ? 'conditioning' : 'lagering'
    const today  = new Date().toISOString().slice(0, 10)
    const extra  = {
      [`${prefix}_temp_target`]:   stageForm.temp_target   ? parseFloat(stageForm.temp_target)   : null,
      [`${prefix}_duration_days`]: stageForm.duration_days ? parseInt(stageForm.duration_days)    : null,
      [`${prefix}_notes`]:         stageForm.notes.trim()  || null,
    }
    if (ns === 'conditioning') extra.conditioning_start_date = today
    if (ns === 'lagering')     extra.lagering_start_date     = today

    const { error } = await supabase.from('fermentations')
      .update({ status: ns, ...extra })
      .eq('id', ferm.id)

    if (!error) {
      const updated = { ...ferm, status: ns, ...extra }
      setFerm(updated)
      onUpdated(updated)
    }
    setStatusChanging(false)
  }

  async function handleDump() {
    if (!window.confirm('Mark this fermentation as DUMPED? This cannot be undone.')) return
    setStatusChanging(true)
    await supabase.from('fermentations').update({ status: 'dumped' }).eq('id', ferm.id)
    const updated = { ...ferm, status: 'dumped' }
    setFerm(updated)
    onUpdated(updated)
    setStatusChanging(false)
    onClose()
  }

  // Log a gravity reading from within the detail modal
  async function saveInlineReading() {
    const g = parseFloat(logForm.gravity)
    if (!logForm.gravity || isNaN(g) || g < 0.99 || g > 1.2) {
      setLogError('Enter a valid gravity between 0.990 and 1.200')
      return
    }
    const { data, error } = await supabase.from('gravity_readings').insert({
      fermentation_id: ferm.id,
      brewery_id:      brewery.id,
      reading_date:    logForm.date || new Date().toISOString().slice(0, 10),
      gravity:         g,
      temperature:     logForm.temperature ? parseFloat(logForm.temperature) : null,
      notes:           logForm.notes.trim() || null,
      reading_type:    'gravity',
    }).select().single()
    if (error) { setLogError(error.message); return }
    setReadings(prev => [...prev, data].sort((a, b) => a.reading_date.localeCompare(b.reading_date)))
    setLogForm({ date: new Date().toISOString().slice(0, 10), gravity: '', temperature: '', notes: '' })
    setLogError('')
    setShowLogForm(false)
    onReadingChanged()
  }

  async function deleteReading(readingId) {
    if (!window.confirm('Delete this reading?')) return
    await supabase.from('gravity_readings').delete().eq('id', readingId)
    setReadings(prev => prev.filter(r => r.id !== readingId))
    onReadingChanged()
  }

  function startEditReading(r) {
    setEditingReading(r.id)
    setEditReadingForm({
      date:        r.reading_date,
      gravity:     String(r.gravity),
      temperature: r.temperature != null ? String(r.temperature) : '',
      notes:       r.notes ?? '',
    })
    setEditReadingError('')
  }

  async function saveEditedReading() {
    const g = parseFloat(editReadingForm.gravity)
    if (!editReadingForm.gravity || isNaN(g) || g < 0.99 || g > 1.2) {
      setEditReadingError('Enter a valid gravity between 0.990 and 1.200')
      return
    }
    const { data, error } = await supabase.from('gravity_readings').update({
      reading_date: editReadingForm.date,
      gravity:      g,
      temperature:  editReadingForm.temperature ? parseFloat(editReadingForm.temperature) : null,
      notes:        editReadingForm.notes.trim() || null,
    }).eq('id', editingReading).select().single()
    if (error) { setEditReadingError(error.message); return }
    setReadings(prev =>
      prev.map(r => r.id === editingReading ? data : r)
          .sort((a, b) => a.reading_date.localeCompare(b.reading_date))
    )
    setEditingReading(null)
    onReadingChanged()
  }

  // Days since pitch — clamped to 0 so future pitch dates don't show negative
  const daysFermenting = ferm.pitch_date
    ? Math.max(0, Math.floor((new Date() - new Date(ferm.pitch_date + 'T00:00:00')) / 86400000))
    : null

  const latestReading = readings.at(-1)
  const attenuation = ferm.actual_og && latestReading
    ? ((parseFloat(ferm.actual_og) - parseFloat(latestReading.gravity)) / (parseFloat(ferm.actual_og) - 1.0)) * 100
    : null

  const nextStatuses = STATUS_TRANSITIONS[ferm.status] ?? []

  const TABS = ['overview', 'gravity_log', 'dry_hop', 'notes']
  const TAB_LABELS = { overview: 'Overview', gravity_log: 'Gravity Log', dry_hop: 'Dry Hop', notes: 'Notes' }

  return (
    <ModalShell
      isOpen onClose={onClose}
      title={ferm.beer_name}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 pt-1">

        {/* Status header row */}
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-gray-100">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[ferm.status]}`}>
            {STATUS_LABELS[ferm.status]}
          </span>
          {ferm.batch_number && (
            <span className="text-xs bg-navy/10 text-navy font-bold px-2 py-0.5 rounded">{ferm.batch_number}</span>
          )}
          {ferm.vessel_id && (
            <span className="text-xs text-gray-500">
              🧪 {vessels.find(v => v.id === ferm.vessel_id)?.vessel_name ?? 'Vessel'}
            </span>
          )}
          {daysFermenting !== null && (
            <span className="text-xs text-gray-500">Day {daysFermenting} fermenting</span>
          )}
          {saveStatus === 'saving' && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
          {saveStatus === 'saved'  && <span className="text-xs text-success ml-auto">Saved ✓</span>}
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-amber text-amber' : 'text-gray-500 hover:text-gray-700'}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-5">

            {/* Vessel assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Vessel</label>
                {!showVesselChange ? (
                  <div className="flex items-center gap-2 min-h-[38px]">
                    <span className="text-sm font-medium text-navy">
                      {vessels.find(v => v.id === ferm.vessel_id)?.vessel_name ?? '— Not assigned —'}
                    </span>
                    {!isReadOnly && (
                      <button
                        onClick={() => setShowVesselChange(true)}
                        className="text-[11px] text-amber underline underline-offset-2 hover:text-amber-dark shrink-0"
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <select
                      className={INPUT_CLS}
                      value={ferm.vessel_id ?? ''}
                      onChange={e => reassignVessel(e.target.value)}
                      disabled={isReadOnly}
                    >
                      <option value="">— Not assigned —</option>
                      {(availableVessels ?? vessels).map(v => (
                        <option key={v.id} value={v.id}>{v.vessel_name} — {v.vessel_type}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowVesselChange(false)}
                      className="text-[11px] text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {reassignSuccess && (
                  <p className="text-[11px] text-success mt-1">{reassignSuccess}</p>
                )}
              </div>
              <div>
                <label className={LBL}>Fermentation type</label>
                <select className={INPUT_CLS} {...si('fermentation_type')}>
                  {Object.entries(FERM_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Volume + OG */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Volume in fermenter</label>
                <input type="number" step="0.1" className={INPUT_CLS} placeholder="7.0" {...fi('volume_in_fermenter', 'number')} />
              </div>
              <div>
                <label className={LBL}>Volume unit</label>
                <select className={INPUT_CLS} {...si('volume_unit')}>
                  <option value="barrels">Barrels</option>
                  <option value="gallons">Gallons</option>
                </select>
              </div>
              <div>
                <label className={LBL}>Actual OG</label>
                <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.065" {...fi('actual_og', 'number')} />
              </div>
              <div>
                <label className={LBL}>Target FG</label>
                <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.012" {...fi('target_fg', 'number')} />
              </div>
            </div>

            {/* FG actuals + ABV */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Actual FG</label>
                <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.010"
                  value={ferm?.actual_fg ?? ''}
                  disabled={isReadOnly}
                  onChange={e => setFerm(p => ({ ...p, actual_fg: e.target.value }))}
                  onBlur={e => saveActualFg(e.target.value.trim())}
                />
              </div>
              <div>
                <label className={LBL}>Target ABV %</label>
                <input type="number" step="0.1" className={INPUT_CLS} placeholder="6.9" {...fi('target_abv', 'number')} />
              </div>
              <div>
                <label className={LBL}>Actual ABV %</label>
                <input type="number" step="0.01" className={INPUT_CLS} placeholder="auto"
                  value={ferm.actual_abv ?? (ferm.actual_og && ferm.actual_fg
                    ? ((parseFloat(ferm.actual_og) - parseFloat(ferm.actual_fg)) * 131.25).toFixed(2)
                    : '')}
                  disabled={isReadOnly}
                  onChange={e => setFerm(p => ({ ...p, actual_abv: e.target.value }))}
                  onBlur={e => saveField('actual_abv', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
              <div>
                <label className={LBL}>Attenuation</label>
                <p className="text-sm font-semibold text-navy py-2">
                  {attenuation !== null ? `${attenuation.toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>

            {/* Yeast */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className={LBL}>Yeast strain</label>
                <input className={INPUT_CLS} placeholder="WY1056" {...fi('yeast_strain')} />
                {/* Part 2B: brew day yeast strain suggestion */}
                {!ferm.yeast_strain && brewDayYeastStrain && (
                  <p className="text-xs text-amber mt-1">
                    From brew day: {brewDayYeastStrain} —{' '}
                    <button
                      onClick={() => {
                        saveField('yeast_strain', brewDayYeastStrain)
                        setFerm(p => ({ ...p, yeast_strain: brewDayYeastStrain }))
                      }}
                      className="underline font-medium"
                    >
                      Click to use
                    </button>
                  </p>
                )}
              </div>
              <div>
                <label className={LBL}>Yeast generation</label>
                <input type="number" min="1" className={INPUT_CLS} {...fi('yeast_generation', 'number')} />
              </div>
              <div>
                <label className={LBL}>Pitch temp °F</label>
                <input type="number" step="0.1" className={INPUT_CLS} {...fi('pitch_temp', 'number')} />
              </div>
            </div>

            {/* Dates + temps */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Pitch date</label>
                <input type="date" className={INPUT_CLS} {...fi('pitch_date')} />
              </div>
              <div>
                <label className={LBL}>Ferm temp target °F</label>
                <input type="number" step="0.1" className={INPUT_CLS} {...fi('fermentation_temp_target', 'number')} />
              </div>
              <div>
                <label className={LBL}>Est. completion</label>
                <input type="date" className={INPUT_CLS} {...fi('estimated_completion_date')} />
              </div>
              <div>
                <label className={LBL}>Target pkg date</label>
                <input type="date" className={INPUT_CLS} {...fi('target_packaging_date')} />
              </div>
            </div>

            {/* Transfer notes */}
            <div>
              <label className={LBL}>Transfer notes</label>
              <textarea rows={2} className={INPUT_CLS} placeholder="Notes on transfer from brew vessel..." {...ti('transfer_notes')} />
            </div>

            {/* Part 2D: Stage History */}
            {(ferm.pitch_date || ferm.conditioning_start_date || ferm.lagering_start_date) && (() => {
              const today_ = new Date().toISOString().slice(0, 10)
              const sortedReadings = [...readings].sort((a, b) => a.reading_date.localeCompare(b.reading_date))
              const primaryReadings = sortedReadings.filter(r =>
                !ferm.conditioning_start_date || r.reading_date < ferm.conditioning_start_date
              )
              const condReadings = sortedReadings.filter(r =>
                ferm.conditioning_start_date &&
                r.reading_date >= ferm.conditioning_start_date &&
                (!ferm.lagering_start_date || r.reading_date < ferm.lagering_start_date)
              )
              const lagerReadings = sortedReadings.filter(r =>
                ferm.lagering_start_date && r.reading_date >= ferm.lagering_start_date
              )
              return (
                <div className="mt-4 border-t pt-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stage History</h4>
                  <div className="space-y-3">

                    {/* ── Primary Fermentation ── */}
                    {ferm.pitch_date && (() => {
                      const endDate = ferm.conditioning_start_date ?? today_
                      const daysInPrimary = Math.floor(
                        (new Date(endDate + 'T00:00:00') - new Date(ferm.pitch_date + 'T00:00:00')) / 86400000
                      )
                      const yeastDisplay = ferm.yeast_strain ?? brewDayYeastStrain
                      const startG = primaryReadings[0]?.gravity ?? ferm.actual_og
                      const endG   = primaryReadings.at(-1)?.gravity
                      const attn   = startG && endG && primaryReadings.length > 1
                        ? Math.round(((parseFloat(startG) - parseFloat(endG)) / (parseFloat(startG) - 1.0)) * 100)
                        : null
                      const isOpen = stageCollapse.primary
                      return (
                        <div className="border border-amber/30 rounded-lg overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-amber/5 text-left"
                            onClick={() => setStageCollapse(p => ({ ...p, primary: !p.primary }))}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber shrink-0" />
                              <span className="font-semibold text-navy text-sm">Primary Fermentation</span>
                            </div>
                            <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 pt-2 space-y-3 bg-white">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Pitch Date</p>
                                  <p className="text-xs font-medium text-gray-700">{ferm.pitch_date}</p>
                                </div>
                                {ferm.pitch_temp && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Pitch Temp</p>
                                    <p className="text-xs font-medium text-gray-700">{ferm.pitch_temp}°F</p>
                                  </div>
                                )}
                                {ferm.fermentation_temp_target && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ferm Temp Target</p>
                                    <p className="text-xs font-medium text-gray-700">{ferm.fermentation_temp_target}°F</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Days in Primary</p>
                                  <p className="text-xs font-medium text-gray-700">
                                    {daysInPrimary} day{daysInPrimary !== 1 ? 's' : ''}
                                    {!ferm.conditioning_start_date && ferm.status === 'fermenting' && ' (ongoing)'}
                                  </p>
                                </div>
                                {yeastDisplay && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Yeast Strain</p>
                                    <p className="text-xs font-medium text-gray-700">{yeastDisplay}</p>
                                  </div>
                                )}
                                {ferm.yeast_generation && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Generation</p>
                                    <p className="text-xs font-medium text-gray-700">Gen {ferm.yeast_generation}</p>
                                  </div>
                                )}
                                {startG && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Starting Gravity</p>
                                    <p className="text-xs font-medium text-gray-700">{parseFloat(startG).toFixed(3)}</p>
                                  </div>
                                )}
                                {endG && primaryReadings.length > 1 && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ending Gravity</p>
                                    <p className="text-xs font-medium text-gray-700">{parseFloat(endG).toFixed(3)}</p>
                                  </div>
                                )}
                                {attn !== null && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Attenuation</p>
                                    <p className="text-xs font-medium text-gray-700">{attn}%</p>
                                  </div>
                                )}
                              </div>
                              {primaryReadings.length >= 2 && (
                                <MiniSparkline readings={primaryReadings} targetFg={ferm.target_fg} fermentation={ferm} />
                              )}
                              {primaryReadings.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-amber/20">
                                        <th className="text-left pb-1.5">Date</th>
                                        <th className="text-right pb-1.5">Gravity</th>
                                        <th className="text-right pb-1.5">Temp °F</th>
                                        <th className="text-left pb-1.5 pl-3">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber/10">
                                      {primaryReadings.map(r => (
                                        <tr key={r.id}>
                                          <td className="py-1.5 text-gray-600">
                                            {new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </td>
                                          <td className="py-1.5 text-right font-mono font-semibold text-amber">{parseFloat(r.gravity).toFixed(3)}</td>
                                          <td className="py-1.5 text-right text-gray-500">{r.temperature ?? '—'}</td>
                                          <td className="py-1.5 pl-3 text-gray-500">{r.notes ?? ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">No gravity readings logged during primary fermentation.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* ── Conditioning ── */}
                    {ferm.conditioning_start_date && (() => {
                      const endDate = ferm.lagering_start_date ?? today_
                      const days = Math.floor(
                        (new Date(endDate + 'T00:00:00') - new Date(ferm.conditioning_start_date + 'T00:00:00')) / 86400000
                      )
                      const startG = condReadings[0]?.gravity
                      const endG   = condReadings.at(-1)?.gravity
                      const isOpen = stageCollapse.conditioning
                      return (
                        <div className="border border-blue-200 rounded-lg overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-blue-50 text-left"
                            onClick={() => setStageCollapse(p => ({ ...p, conditioning: !p.conditioning }))}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                              <span className="font-semibold text-blue-800 text-sm">Conditioning</span>
                            </div>
                            <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 pt-2 space-y-3 bg-white">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Start Date</p>
                                  <p className="text-xs font-medium text-gray-700">{ferm.conditioning_start_date}</p>
                                </div>
                                {ferm.conditioning_temp_target && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Temp Target</p>
                                    <p className="text-xs font-medium text-gray-700">{ferm.conditioning_temp_target}°F</p>
                                  </div>
                                )}
                                {ferm.conditioning_duration_days && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Target Duration</p>
                                    <p className="text-xs font-medium text-gray-700">{ferm.conditioning_duration_days} days</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Days in Conditioning</p>
                                  <p className="text-xs font-medium text-gray-700">
                                    {days} day{days !== 1 ? 's' : ''}
                                    {!ferm.lagering_start_date && ferm.status === 'conditioning' && ' (ongoing)'}
                                  </p>
                                </div>
                                {startG && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Starting Gravity</p>
                                    <p className="text-xs font-medium text-gray-700">{parseFloat(startG).toFixed(3)}</p>
                                  </div>
                                )}
                                {endG && condReadings.length > 1 && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ending Gravity</p>
                                    <p className="text-xs font-medium text-gray-700">{parseFloat(endG).toFixed(3)}</p>
                                  </div>
                                )}
                              </div>
                              {ferm.conditioning_notes && (
                                <p className="text-xs text-gray-600 bg-blue-50 rounded px-2 py-1.5">{ferm.conditioning_notes}</p>
                              )}
                              {condReadings.length >= 2 && (
                                <MiniSparkline readings={condReadings} targetFg={ferm.target_fg} fermentation={ferm} />
                              )}
                              {condReadings.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-blue-200">
                                        <th className="text-left pb-1.5">Date</th>
                                        <th className="text-right pb-1.5">Gravity</th>
                                        <th className="text-right pb-1.5">Temp °F</th>
                                        <th className="text-left pb-1.5 pl-3">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-blue-100">
                                      {condReadings.map(r => (
                                        <tr key={r.id}>
                                          <td className="py-1.5 text-gray-600">
                                            {new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </td>
                                          <td className="py-1.5 text-right font-mono font-semibold text-blue-700">{parseFloat(r.gravity).toFixed(3)}</td>
                                          <td className="py-1.5 text-right text-gray-500">{r.temperature ?? '—'}</td>
                                          <td className="py-1.5 pl-3 text-gray-500">{r.notes ?? ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">No gravity readings logged during conditioning.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* ── Lagering ── */}
                    {ferm.lagering_start_date && (() => {
                      const days = Math.floor(
                        (new Date(today_ + 'T00:00:00') - new Date(ferm.lagering_start_date + 'T00:00:00')) / 86400000
                      )
                      const startG = lagerReadings[0]?.gravity
                      const endG   = lagerReadings.at(-1)?.gravity
                      const isOpen = stageCollapse.lagering
                      return (
                        <div className="border border-indigo-200 rounded-lg overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-indigo-50 text-left"
                            onClick={() => setStageCollapse(p => ({ ...p, lagering: !p.lagering }))}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                              <span className="font-semibold text-indigo-800 text-sm">Lagering</span>
                            </div>
                            <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 pt-2 space-y-3 bg-white">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Start Date</p>
                                  <p className="text-xs font-medium text-gray-700">{ferm.lagering_start_date}</p>
                                </div>
                                {ferm.lagering_temp_target && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Temp Target</p>
                                    <p className="text-xs font-medium text-gray-700">{ferm.lagering_temp_target}°F</p>
                                  </div>
                                )}
                                {ferm.lagering_duration_days && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Target Duration</p>
                                    <p className="text-xs font-medium text-gray-700">{ferm.lagering_duration_days} days</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Days Lagering</p>
                                  <p className="text-xs font-medium text-gray-700">
                                    {days} day{days !== 1 ? 's' : ''}
                                    {ferm.status === 'lagering' && ' (ongoing)'}
                                  </p>
                                </div>
                                {startG && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Starting Gravity</p>
                                    <p className="text-xs font-medium text-gray-700">{parseFloat(startG).toFixed(3)}</p>
                                  </div>
                                )}
                                {endG && lagerReadings.length > 1 && (
                                  <div>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ending Gravity</p>
                                    <p className="text-xs font-medium text-gray-700">{parseFloat(endG).toFixed(3)}</p>
                                  </div>
                                )}
                              </div>
                              {ferm.lagering_notes && (
                                <p className="text-xs text-gray-600 bg-indigo-50 rounded px-2 py-1.5">{ferm.lagering_notes}</p>
                              )}
                              {lagerReadings.length >= 2 && (
                                <MiniSparkline readings={lagerReadings} targetFg={ferm.target_fg} fermentation={ferm} />
                              )}
                              {lagerReadings.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-indigo-200">
                                        <th className="text-left pb-1.5">Date</th>
                                        <th className="text-right pb-1.5">Gravity</th>
                                        <th className="text-right pb-1.5">Temp °F</th>
                                        <th className="text-left pb-1.5 pl-3">Notes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-indigo-100">
                                      {lagerReadings.map(r => (
                                        <tr key={r.id}>
                                          <td className="py-1.5 text-gray-600">
                                            {new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </td>
                                          <td className="py-1.5 text-right font-mono font-semibold text-indigo-700">{parseFloat(r.gravity).toFixed(3)}</td>
                                          <td className="py-1.5 text-right text-gray-500">{r.temperature ?? '—'}</td>
                                          <td className="py-1.5 pl-3 text-gray-500">{r.notes ?? ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">No gravity readings logged during lagering.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                  </div>
                </div>
              )
            })()}

            {/* Status progression */}
            {(nextStatuses.length > 0 || !['packaged', 'dumped'].includes(ferm.status)) && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Change status</p>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map(ns => {
                    const blocked = ns === 'conditioning' && ferm.status === 'fermenting' && !ferm.actual_fg
                    return (
                      <div key={ns} className="flex flex-col items-start gap-0.5">
                        <button onClick={() => changeStatus(ns)}
                          disabled={statusChanging || isReadOnly || blocked}
                          className="text-xs bg-navy text-white rounded-lg px-3 py-1.5 hover:bg-navy-light transition-colors disabled:opacity-50">
                          → {STATUS_LABELS[ns]}
                        </button>
                        {ns === 'conditioning' && ferm.status === 'fermenting' && (
                          <span className="text-[10px] text-amber leading-tight">
                            Enter Final Gravity before moving to Conditioning.
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {!['packaged', 'dumped'].includes(ferm.status) && (
                    <button onClick={handleDump} disabled={statusChanging || isReadOnly}
                      className="text-xs border border-danger text-danger rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto">
                      Dump Batch
                    </button>
                  )}
                </div>
                {statusError && (
                  <p className="text-xs text-danger mt-2">{statusError}</p>
                )}
                {statusNote === 'ready_to_package' && (
                  <p className="text-xs text-success mt-2">
                    ✓ Packaging run created.{' '}
                    <Link to="/packaging" onClick={onClose} className="underline font-medium">
                      Complete packaging details →
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Gravity Log ── */}
        {tab === 'gravity_log' && (
          <div className="space-y-4">
            <GravityChart readings={readings} fermentation={ferm} height={320} />

            {/* Log reading button / inline form toggle */}
            {!showLogForm ? (
              <button onClick={() => setShowLogForm(true)} disabled={isReadOnly}
                className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg px-4 py-2 transition-colors disabled:opacity-50">
                + Log Reading
              </button>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-navy text-sm">Log New Reading</h4>
                {logError && <p className="text-xs text-danger bg-red-50 rounded px-3 py-2">{logError}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={LBL}>Date</label>
                    <input type="date" className={INPUT_CLS} value={logForm.date}
                      onChange={e => setLogForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div>
                    <label className={LBL}>Gravity</label>
                    <input type="number" step="0.001" min="0.990" max="1.200" placeholder="1.048"
                      className={INPUT_CLS} value={logForm.gravity}
                      onChange={e => { setLogError(''); setLogForm(p => ({ ...p, gravity: e.target.value })) }} />
                  </div>
                  <div>
                    <label className={LBL}>Temp °F</label>
                    <input type="number" step="0.1" placeholder="68" className={INPUT_CLS} value={logForm.temperature}
                      onChange={e => setLogForm(p => ({ ...p, temperature: e.target.value }))} />
                  </div>
                  <div>
                    <label className={LBL}>Notes</label>
                    <input className={INPUT_CLS} placeholder="Optional" value={logForm.notes}
                      onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowLogForm(false)}
                    className="text-sm border border-gray-300 text-gray-600 rounded-lg px-4 py-2 hover:bg-white transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveInlineReading}
                    className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg px-4 py-2 transition-colors">
                    Save Reading
                  </button>
                </div>
              </div>
            )}

            {/* Readings table */}
            {readings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-200">
                      <th className="text-left pb-2">Date</th>
                      <th className="text-right pb-2">Gravity</th>
                      <th className="text-right pb-2">Temp °F</th>
                      <th className="text-left pb-2 pl-4">Notes</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {readings.map(r => (
                      editingReading === r.id ? (
                        <tr key={r.id} className="bg-amber/5">
                          <td colSpan={5} className="py-3 px-2">
                            {editReadingError && <p className="text-xs text-danger mb-2">{editReadingError}</p>}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                              <div>
                                <label className={LBL}>Date</label>
                                <input type="date" className={INPUT_CLS} value={editReadingForm.date}
                                  onChange={e => setEditReadingForm(p => ({ ...p, date: e.target.value }))} />
                              </div>
                              <div>
                                <label className={LBL}>Gravity</label>
                                <input type="number" step="0.001" min="0.990" max="1.200" className={INPUT_CLS}
                                  value={editReadingForm.gravity}
                                  onChange={e => { setEditReadingError(''); setEditReadingForm(p => ({ ...p, gravity: e.target.value })) }} />
                              </div>
                              <div>
                                <label className={LBL}>Temp °F</label>
                                <input type="number" step="0.1" className={INPUT_CLS}
                                  value={editReadingForm.temperature}
                                  onChange={e => setEditReadingForm(p => ({ ...p, temperature: e.target.value }))} />
                              </div>
                              <div>
                                <label className={LBL}>Notes</label>
                                <input className={INPUT_CLS} value={editReadingForm.notes}
                                  onChange={e => setEditReadingForm(p => ({ ...p, notes: e.target.value }))} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setEditingReading(null)}
                                className="text-sm border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 hover:bg-white transition-colors">
                                Cancel
                              </button>
                              <button onClick={saveEditedReading}
                                className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg px-3 py-1.5 transition-colors">
                                Save
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.id}>
                          <td className="py-2 text-gray-600">
                            {new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="py-2 text-right font-mono font-semibold text-navy">{parseFloat(r.gravity).toFixed(3)}</td>
                          <td className="py-2 text-right text-gray-500">{r.temperature ?? '—'}</td>
                          <td className="py-2 pl-4 text-gray-500 text-xs">{r.notes ?? ''}</td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => startEditReading(r)} disabled={isReadOnly}
                                className="text-xs text-gray-300 hover:text-amber transition-colors disabled:opacity-30"
                                title="Edit reading">✎</button>
                              <button onClick={() => deleteReading(r.id)} disabled={isReadOnly}
                                className="text-xs text-gray-300 hover:text-danger transition-colors disabled:opacity-30">✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {readings.length === 0 && !showLogForm && (
              <p className="text-sm text-gray-400 text-center py-4">No readings logged yet.</p>
            )}
          </div>
        )}

        {/* ── Tab: Dry Hop & Additions ── */}
        {tab === 'dry_hop' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-4">
                <input type="checkbox"
                  checked={ferm.dry_hop_scheduled ?? false}
                  disabled={isReadOnly}
                  onChange={e => saveField('dry_hop_scheduled', e.target.checked)}
                  className="w-4 h-4 accent-amber"
                />
                <div>
                  <p className="font-medium text-navy text-sm">Dry hop scheduled</p>
                  <p className="text-xs text-gray-400">Mark when a dry hop addition is planned</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-4">
                <input type="checkbox"
                  checked={ferm.dry_hop_completed ?? false}
                  disabled={isReadOnly}
                  onChange={e => saveField('dry_hop_completed', e.target.checked)}
                  className="w-4 h-4 accent-amber"
                />
                <div>
                  <p className="font-medium text-navy text-sm">Dry hop completed</p>
                  <p className="text-xs text-gray-400">Mark when dry hops have been added</p>
                </div>
              </label>
            </div>

            {ferm.dry_hop_scheduled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Dry hop date</label>
                  <input type="date" className={INPUT_CLS} {...fi('dry_hop_date')} />
                </div>
                <div>
                  <label className={LBL}>Lagering temp target °F</label>
                  <input type="number" step="0.1" className={INPUT_CLS} {...fi('lagering_temp_target', 'number')} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Conditioning start date</label>
                <input type="date" className={INPUT_CLS} {...fi('conditioning_start_date')} />
              </div>
              <div>
                <label className={LBL}>Lagering duration (days)</label>
                <input type="number" min="1" className={INPUT_CLS} {...fi('lagering_duration_days', 'number')} />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Notes ── */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <div>
              <label className={LBL}>Transfer notes</label>
              <textarea rows={4} className={INPUT_CLS}
                placeholder="Notes on transfer from brew vessel to fermenter — observations, issues, volumes..."
                {...ti('transfer_notes')}
              />
            </div>
            <div>
              <label className={LBL}>Fermentation notes</label>
              <textarea rows={6} className={INPUT_CLS}
                placeholder="General fermentation observations, temperature changes, krausen height, aroma..."
                {...ti('notes')}
              />
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose}
            className="text-sm border border-gray-300 text-gray-600 rounded-lg px-5 py-2.5 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* Part 2D: Stage settings modal (conditioning/lagering) — rendered inside ModalShell */}
      {stageFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-bold text-navy mb-4">
              {stageFormOpen === 'conditioning' ? 'Conditioning Settings' : 'Lagering Settings'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Temperature Target (°F)</label>
                <input type="number" step="0.1"
                  value={stageForm.temp_target}
                  onChange={e => setStageForm(f => ({ ...f, temp_target: e.target.value }))}
                  placeholder="e.g. 34"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Duration Target (days)</label>
                <input type="number" min="1"
                  value={stageForm.duration_days}
                  onChange={e => setStageForm(f => ({ ...f, duration_days: e.target.value }))}
                  placeholder="e.g. 14"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <textarea rows={2}
                  value={stageForm.notes}
                  onChange={e => setStageForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => confirmStageTransition()}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Confirm & Move to {stageFormOpen === 'conditioning' ? 'Conditioning' : 'Lagering'}
              </button>
              <button
                onClick={() => { setStageFormOpen(false); setPendingStatus(null) }}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
