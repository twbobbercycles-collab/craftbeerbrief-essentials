/**
 * BreweryRecordsPage — unified compliance document vault.
 * All records live in brewery_documents. Category filters and dynamic metadata
 * fields adapt to the selected document type.
 */
import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { usePersistedTab } from '../../hooks/usePersistedTab'
import { supabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../../components/LoadingSpinner'
import DismissibleDisclaimer from '../../components/DismissibleDisclaimer'
import ModalShell from '../../components/ModalShell'
import { useModalDraft } from '../../hooks/useModalDraft'
import DraftNoticeBar from '../../components/DraftNoticeBar'
import { useReadOnly } from '../../hooks/useReadOnly'

// ─── Document type groups (for dropdown optgroups) ────────────────────────────

const DOC_TYPE_GROUPS = [
  { group: 'Federal', types: [
    "Brewer's Notice (TTB)",
    'Beer Bond / Surety Bond',
    'TTB Formula Approval',
    'Alternating Proprietorship Agreement',
    'Other Federal',
  ]},
  { group: 'State', types: [
    'State Brewery License',
    'State ABC / Liquor Authority License',
    'State Retailer License',
    'State Brand Registration',
    "State Sales Tax Permit / Seller's Permit",
    'Other State License',
  ]},
  { group: 'Local & Municipal', types: [
    'Business License',
    'Zoning Approval / Conditional Use Permit',
    'Certificate of Occupancy',
    'Health Department Permit',
    'Fire Safety Inspection Certificate',
    'Outdoor Seating / Patio Permit',
    'Entertainment / Music License',
    'Sign Permit',
    'Building Permit',
    'Wastewater / Environmental Permit',
    'Event Permit',
    'Other Local Permit',
  ]},
  { group: 'Insurance', types: [
    'General Liability',
    'Liquor Liability',
    'Property Insurance',
    'Workers Compensation',
    'Product Liability',
    'Umbrella / Excess Liability',
    'Equipment Breakdown',
    'Commercial Auto',
    'Cyber Liability',
    'Directors & Officers (D&O)',
    'Other Insurance',
  ]},
  { group: 'Agreements & Contracts', types: [
    'Distribution Agreement',
    'Alternating Proprietorship Agreement',
    'Lease Agreement',
    'Equipment Lease',
    'Vendor Contract',
    'Brewing Services Agreement',
    'Co-packing Agreement',
    'Other Agreement',
  ]},
  { group: 'Other', types: [
    'ADA Compliance Documentation',
    'Environmental Impact Assessment',
    'Water Rights Permit',
    'Wastewater Discharge Permit',
    'Other',
  ]},
]

// ─── Category filter definitions ──────────────────────────────────────────────

const CATEGORIES = [
  { id: 'all',        label: 'All Records' },
  { id: 'federal',    label: 'Federal' },
  { id: 'state',      label: 'State' },
  { id: 'local',      label: 'Local & Municipal' },
  { id: 'insurance',  label: 'Insurance' },
  { id: 'agreements', label: 'Agreements & Contracts' },
  { id: 'other',      label: 'Other' },
]

// Include both new human-readable values and legacy snake_case values so old
// records are correctly categorized without a data migration.
const FEDERAL_TYPES = [
  'federal_license', 'Federal License', "Brewer's Notice", 'TTB Permit', 'Federal Permit',
  "Brewer's Notice (TTB)", 'Beer Bond / Surety Bond', 'TTB Formula Approval',
  'Alternating Proprietorship Agreement', 'Other Federal',
]
const STATE_TYPES = [
  'state_license', 'State License', 'State Brewery License', 'State Permit',
  'State ABC / Liquor Authority License', 'State Retailer License',
  'State Brand Registration', "State Sales Tax Permit / Seller's Permit", 'Other State License',
]
const LOCAL_TYPES = [
  'local_permit', 'taproom_permit', 'health_permit',
  'Local & Municipal Permit', 'Local Permit', 'Municipal License',
  'Zoning Permit', 'Health Permit', 'Taproom Permit',
  'Business License', 'Zoning Approval / Conditional Use Permit', 'Certificate of Occupancy',
  'Health Department Permit', 'Fire Safety Inspection Certificate',
  'Outdoor Seating / Patio Permit', 'Entertainment / Music License', 'Sign Permit',
  'Building Permit', 'Wastewater / Environmental Permit', 'Event Permit', 'Other Local Permit',
]
const INSURANCE_TYPES = [
  'insurance', 'Insurance', 'Insurance Policy',
  'General Liability', 'Liquor Liability', 'Property Insurance', 'Workers Compensation',
  'Product Liability', 'Umbrella / Excess Liability', 'Equipment Breakdown', 'Commercial Auto',
  'Cyber Liability', 'Directors & Officers (D&O)', 'Other Insurance',
]
const AGREEMENT_TYPES = [
  'Distribution Agreement', 'Contract / Agreement', 'Agreement', 'Contract',
  'Alternating Proprietorship Agreement', 'Lease Agreement', 'Equipment Lease',
  'Vendor Contract', 'Brewing Services Agreement', 'Co-packing Agreement', 'Other Agreement',
]

const ALL_KNOWN = [...FEDERAL_TYPES, ...STATE_TYPES, ...LOCAL_TYPES, ...INSURANCE_TYPES, ...AGREEMENT_TYPES]

// Used to resolve navigation state category names from TtbPage to filter ids
const SLUG_MAP = { Federal: 'federal', State: 'state' }

function matchesCategory(doc, cat) {
  if (cat === 'all')        return true
  if (cat === 'federal')    return FEDERAL_TYPES.includes(doc.document_type)
  if (cat === 'state')      return STATE_TYPES.includes(doc.document_type)
  if (cat === 'local')      return LOCAL_TYPES.includes(doc.document_type)
  if (cat === 'insurance')  return INSURANCE_TYPES.includes(doc.document_type)
  if (cat === 'agreements') return AGREEMENT_TYPES.includes(doc.document_type)
  if (cat === 'other')      return !ALL_KNOWN.includes(doc.document_type)
  return false
}

// ─── Document category for metadata field rendering ───────────────────────────

function getDocumentCategory(docType) {
  const federal = [
    "Brewer's Notice (TTB)", 'Beer Bond / Surety Bond', 'TTB Formula Approval', 'Other Federal',
  ]
  const state = [
    'State Brewery License', 'State ABC / Liquor Authority License', 'State Retailer License',
    'State Brand Registration', "State Sales Tax Permit / Seller's Permit", 'Other State License',
  ]
  const local = [
    'Business License', 'Zoning Approval / Conditional Use Permit', 'Certificate of Occupancy',
    'Health Department Permit', 'Fire Safety Inspection Certificate', 'Outdoor Seating / Patio Permit',
    'Entertainment / Music License', 'Sign Permit', 'Building Permit',
    'Wastewater / Environmental Permit', 'Event Permit', 'Other Local Permit',
  ]
  const insurance = [
    'General Liability', 'Liquor Liability', 'Property Insurance', 'Workers Compensation',
    'Product Liability', 'Umbrella / Excess Liability', 'Equipment Breakdown', 'Commercial Auto',
    'Cyber Liability', 'Directors & Officers (D&O)', 'Other Insurance',
  ]
  const agreements = [
    'Distribution Agreement', 'Alternating Proprietorship Agreement', 'Lease Agreement',
    'Equipment Lease', 'Vendor Contract', 'Brewing Services Agreement',
    'Co-packing Agreement', 'Other Agreement',
  ]
  if (federal.includes(docType))    return 'federal'
  if (state.includes(docType))      return 'state'
  if (local.includes(docType))      return 'local'
  if (insurance.includes(docType))  return 'insurance'
  if (agreements.includes(docType)) return 'agreements'
  return 'other'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

const EMPTY_FORM    = { name: '', type: '', expiration_date: '', notes: '' }
const EMPTY_CONTACT = { name: '', title: '', phone: '', email: '' }

// ─── Utility functions ────────────────────────────────────────────────────────

function getExpirationStatus(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp  = new Date(dateStr + 'T00:00:00')
  const diff = Math.floor((exp - today) / 86400000)
  if (diff < 0)   return 'expired'
  if (diff <= 30) return 'urgent'
  if (diff <= 90) return 'warning'
  return 'ok'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)    return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ─── Shared small components ──────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber bg-white'

function FormField({ label, required, optional, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-navy mb-1.5">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
        {optional && <span className="text-gray-400 font-normal ml-1">(optional{hint ? `, ${hint}` : ''})</span>}
      </label>
      {children}
    </div>
  )
}

function ErrorBar({ message, onDismiss }) {
  return (
    <div className="bg-red-50 border border-danger text-danger rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-2">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss}
          className="shrink-0 text-danger/60 hover:text-danger font-medium underline text-xs mt-0.5">Dismiss</button>
      )}
    </div>
  )
}

function Spinner({ label }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
      {label}
    </span>
  )
}

function DocTypeSelect({ value, onChange, required }) {
  return (
    <select required={required} value={value} onChange={onChange} className={inputCls}>
      <option value="">Select type...</option>
      {DOC_TYPE_GROUPS.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.types.map(t => <option key={t} value={t}>{t}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

// ─── Contacts section (shared by Add and Edit modals) ─────────────────────────

function ContactsSection({ contacts, onChange }) {
  function addContact()              { onChange([...contacts, { ...EMPTY_CONTACT }]) }
  function update(i, field, value)   { onChange(contacts.map((c, j) => j === i ? { ...c, [field]: value } : c)) }
  function remove(i)                 { onChange(contacts.filter((_, j) => j !== i)) }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-navy">Contacts</span>
        <button type="button" onClick={addContact}
          className="text-xs bg-amber/10 text-amber hover:bg-amber/20 font-semibold px-2.5 py-1 rounded-lg transition-colors">
          + Add Contact
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No contacts added. Click "Add Contact" to add agents, renewal coordinators, or inspectors.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map((c, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 relative">
              {i === 0 && <span className="absolute top-2 left-3 text-xs text-amber font-semibold">Primary Contact</span>}
              <button type="button" onClick={() => remove(i)}
                className="absolute top-2 right-2 text-gray-400 hover:text-danger text-base leading-none" title="Remove">✕</button>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${i === 0 ? 'mt-5' : ''}`}>
                <input type="text"  placeholder="Contact name"   value={c.name}  onChange={e => update(i, 'name', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber" />
                <input type="text"  placeholder="Title / role"   value={c.title} onChange={e => update(i, 'title', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber" />
                <input type="tel"   placeholder="Phone number"   value={c.phone} onChange={e => update(i, 'phone', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber" />
                <input type="email" placeholder="Email address"  value={c.email} onChange={e => update(i, 'email', e.target.value)}
                  className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MetadataSection — dynamic fields based on document type ──────────────────

function MetadataSection({ docType, meta, onChange }) {
  const category = getDocumentCategory(docType)
  if (!docType) return null

  function set(key, value) { onChange({ ...meta, [key]: value }) }

  const STATE_ACTIVITIES = ['On-premise sales', 'To-go sales', 'Self-distribution', 'Special events']

  if (category === 'federal') {
    return (
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <p className="text-sm font-bold text-navy">Federal Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Permit / Notice Number" optional>
            <input type="text" value={meta.permit_number ?? ''} onChange={e => set('permit_number', e.target.value)}
              placeholder="e.g. BR-12345678" className={inputCls} />
          </FormField>
          <FormField label="TTB Permit Online Ref #" optional>
            <input type="text" value={meta.ttb_ref ?? ''} onChange={e => set('ttb_ref', e.target.value)}
              placeholder="TPOL reference number" className={inputCls} />
          </FormField>
        </div>

        <FormField label="Last Amended Date" optional>
          <input type="date" value={meta.last_amended_date ?? ''} onChange={e => set('last_amended_date', e.target.value)}
            className={inputCls} />
        </FormField>

        <FormField label="Authorized Activities" optional>
          <textarea rows={2} value={meta.authorized_activities ?? ''}
            onChange={e => set('authorized_activities', e.target.value)}
            placeholder="e.g. Produce beer, Self-distribute within state..."
            className={inputCls + ' resize-none'} />
        </FormField>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!meta.bond_required}
              onChange={e => set('bond_required', e.target.checked)}
              className="w-4 h-4 accent-amber rounded" />
            <span className="text-sm font-semibold text-navy">Bond Required</span>
          </label>
          {meta.bond_required && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-6">
              <FormField label="Bond Amount ($)" optional>
                <input type="number" min="0" step="0.01" value={meta.bond_amount ?? ''}
                  onChange={e => set('bond_amount', e.target.value)} placeholder="0.00" className={inputCls} />
              </FormField>
              <FormField label="Bond Expiration Date" optional>
                <input type="date" value={meta.bond_expiration_date ?? ''}
                  onChange={e => set('bond_expiration_date', e.target.value)} className={inputCls} />
              </FormField>
              <FormField label="Surety Company" optional>
                <input type="text" value={meta.surety_company ?? ''}
                  onChange={e => set('surety_company', e.target.value)} placeholder="Company name" className={inputCls} />
              </FormField>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (category === 'state') {
    const activities = Array.isArray(meta.authorized_activities) ? meta.authorized_activities : []
    return (
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <p className="text-sm font-bold text-navy">State License Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="License Number" optional>
            <input type="text" value={meta.license_number ?? ''} onChange={e => set('license_number', e.target.value)}
              placeholder="License / permit number" className={inputCls} />
          </FormField>
          <FormField label="Issuing State Agency" optional>
            <input type="text" value={meta.issuing_agency ?? ''} onChange={e => set('issuing_agency', e.target.value)}
              placeholder="e.g. PA Liquor Control Board" className={inputCls} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="License Sub-type" optional>
            <input type="text" value={meta.license_subtype ?? ''} onChange={e => set('license_subtype', e.target.value)}
              placeholder="e.g. Microbrewery, Brewpub, Farm Brewery" className={inputCls} />
          </FormField>
          <FormField label="Annual Production Limit (barrels)" optional>
            <input type="number" min="0" step="1" value={meta.annual_production_limit ?? ''}
              onChange={e => set('annual_production_limit', e.target.value)}
              placeholder="Leave blank if no limit" className={inputCls} />
          </FormField>
        </div>

        <div>
          <p className="text-sm font-semibold text-navy mb-2">Authorized Activities</p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {STATE_ACTIVITIES.map(act => (
              <label key={act} className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                <input type="checkbox"
                  checked={activities.includes(act)}
                  onChange={e => set('authorized_activities',
                    e.target.checked ? [...activities, act] : activities.filter(a => a !== act)
                  )}
                  className="w-4 h-4 accent-amber rounded" />
                {act}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!meta.bond_required}
              onChange={e => set('bond_required', e.target.checked)}
              className="w-4 h-4 accent-amber rounded" />
            <span className="text-sm font-semibold text-navy">Bond Required</span>
          </label>
          {meta.bond_required && (
            <div className="pl-6">
              <FormField label="Bond Amount ($)" optional>
                <input type="number" min="0" step="0.01" value={meta.bond_amount ?? ''}
                  onChange={e => set('bond_amount', e.target.value)} placeholder="0.00" className={inputCls} />
              </FormField>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (category === 'local') {
    return (
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <p className="text-sm font-bold text-navy">Local / Municipal Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Permit Number" optional>
            <input type="text" value={meta.permit_number ?? ''} onChange={e => set('permit_number', e.target.value)}
              placeholder="Permit / license number" className={inputCls} />
          </FormField>
          <FormField label="Issuing Authority" optional>
            <input type="text" value={meta.issuing_authority ?? ''} onChange={e => set('issuing_authority', e.target.value)}
              placeholder="City / County / Township name" className={inputCls} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Issuing Authority Type" optional>
            <select value={meta.authority_type ?? ''} onChange={e => set('authority_type', e.target.value)} className={inputCls}>
              <option value="">Select...</option>
              {['City', 'County', 'Township', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Zoning Classification" optional>
            <input type="text" value={meta.zoning_classification ?? ''} onChange={e => set('zoning_classification', e.target.value)}
              placeholder="e.g. I-1, B-2, Commercial" className={inputCls} />
          </FormField>
        </div>

        <FormField label="Maximum Occupancy" optional>
          <input type="number" min="0" step="1" value={meta.max_occupancy ?? ''}
            onChange={e => set('max_occupancy', e.target.value)}
            placeholder="Leave blank if not applicable" className={inputCls} />
        </FormField>

        <FormField label="Conditions or Restrictions" optional>
          <textarea rows={2} value={meta.conditions ?? ''} onChange={e => set('conditions', e.target.value)}
            placeholder="Any conditions placed on this permit..." className={inputCls + ' resize-none'} />
        </FormField>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!meta.inspection_required}
              onChange={e => set('inspection_required', e.target.checked)}
              className="w-4 h-4 accent-amber rounded" />
            <span className="text-sm font-semibold text-navy">Inspection Required</span>
          </label>
          {meta.inspection_required && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
              <FormField label="Last Inspection Date" optional>
                <input type="date" value={meta.last_inspection_date ?? ''}
                  onChange={e => set('last_inspection_date', e.target.value)} className={inputCls} />
              </FormField>
              <FormField label="Next Inspection Date" optional>
                <input type="date" value={meta.next_inspection_date ?? ''}
                  onChange={e => set('next_inspection_date', e.target.value)} className={inputCls} />
              </FormField>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (category === 'insurance') {
    return (
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <p className="text-sm font-bold text-navy">Insurance Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Policy Number" optional>
            <input type="text" value={meta.policy_number ?? ''} onChange={e => set('policy_number', e.target.value)}
              placeholder="Policy / certificate number" className={inputCls} />
          </FormField>
          <FormField label="Insurer / Insurance Company" optional>
            <input type="text" value={meta.insurer ?? ''} onChange={e => set('insurer', e.target.value)}
              placeholder="Company name" className={inputCls} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="Coverage Amount ($)" optional>
            <input type="number" min="0" step="1000" value={meta.coverage_amount ?? ''}
              onChange={e => set('coverage_amount', e.target.value)} placeholder="0" className={inputCls} />
          </FormField>
          <FormField label="Deductible ($)" optional>
            <input type="number" min="0" step="100" value={meta.deductible ?? ''}
              onChange={e => set('deductible', e.target.value)} placeholder="0" className={inputCls} />
          </FormField>
          <FormField label="Premium Amount ($)" optional>
            <input type="number" min="0" step="0.01" value={meta.premium_amount ?? ''}
              onChange={e => set('premium_amount', e.target.value)} placeholder="0.00" className={inputCls} />
          </FormField>
        </div>

        <FormField label="Premium Frequency" optional>
          <select value={meta.premium_frequency ?? ''} onChange={e => set('premium_frequency', e.target.value)} className={inputCls}>
            <option value="">Select...</option>
            {['Monthly', 'Quarterly', 'Annual'].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="Claims Contact Name" optional>
            <input type="text" value={meta.claims_contact ?? ''} onChange={e => set('claims_contact', e.target.value)}
              placeholder="Contact name" className={inputCls} />
          </FormField>
          <FormField label="Claims Phone" optional>
            <input type="tel" value={meta.claims_phone ?? ''} onChange={e => set('claims_phone', e.target.value)}
              placeholder="Phone number" className={inputCls} />
          </FormField>
          <FormField label="Claims Email" optional>
            <input type="email" value={meta.claims_email ?? ''} onChange={e => set('claims_email', e.target.value)}
              placeholder="Email address" className={inputCls} />
          </FormField>
        </div>
      </div>
    )
  }

  if (category === 'agreements') {
    return (
      <div className="space-y-4 border-t border-gray-100 pt-4">
        <p className="text-sm font-bold text-navy">Agreement Details</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Other Party Name" optional>
            <input type="text" value={meta.other_party ?? ''} onChange={e => set('other_party', e.target.value)}
              placeholder="Distributor, landlord, vendor..." className={inputCls} />
          </FormField>
          <FormField label="State Covered" optional>
            <input type="text" value={meta.state_covered ?? ''} onChange={e => set('state_covered', e.target.value)}
              placeholder="e.g. Pennsylvania" className={inputCls} />
          </FormField>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!meta.exclusive_territory}
              onChange={e => set('exclusive_territory', e.target.checked)}
              className="w-4 h-4 accent-amber rounded" />
            <span className="text-sm font-semibold text-navy">Exclusive Territory</span>
          </label>
          {meta.exclusive_territory && (
            <div className="pl-6">
              <FormField label="Territory Description" optional>
                <input type="text" value={meta.territory_description ?? ''}
                  onChange={e => set('territory_description', e.target.value)}
                  placeholder="Describe the exclusive territory..." className={inputCls} />
              </FormField>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!meta.attorney_reviewed}
              onChange={e => set('attorney_reviewed', e.target.checked)}
              className="w-4 h-4 accent-amber rounded" />
            <span className="text-sm font-semibold text-navy">Attorney Reviewed</span>
          </label>
          {meta.attorney_reviewed && (
            <div className="pl-6">
              <FormField label="Attorney Review Date" optional>
                <input type="date" value={meta.attorney_review_date ?? ''}
                  onChange={e => set('attorney_review_date', e.target.value)} className={inputCls} />
              </FormField>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={!!meta.automatic_renewal}
            onChange={e => set('automatic_renewal', e.target.checked)}
            className="w-4 h-4 accent-amber rounded" />
          <span className="text-sm font-semibold text-navy">Automatic Renewal</span>
        </label>

        <FormField label="Key Termination Conditions" optional>
          <textarea rows={2} value={meta.termination_conditions ?? ''}
            onChange={e => set('termination_conditions', e.target.value)}
            placeholder="e.g. 90-day written notice required..." className={inputCls + ' resize-none'} />
        </FormField>
      </div>
    )
  }

  // category === 'other'
  return (
    <div className="space-y-4 border-t border-gray-100 pt-4">
      <p className="text-sm font-bold text-navy">Additional Details</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Reference Number" optional>
          <input type="text" value={meta.reference_number ?? ''} onChange={e => set('reference_number', e.target.value)}
            placeholder="Reference / ID number" className={inputCls} />
        </FormField>
        <FormField label="Issuing Organization" optional>
          <input type="text" value={meta.issuing_organization ?? ''} onChange={e => set('issuing_organization', e.target.value)}
            placeholder="Organization name" className={inputCls} />
        </FormField>
      </div>
    </div>
  )
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function BreweryRecordsPage() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()
  const location = useLocation()
  const fileInputRef = useRef(null)
  const editFileRef  = useRef(null)
  const addDraft     = useModalDraft('modal_draft_document')

  // ── Filter state ──
  const [activeCategory, setActiveCategory] = usePersistedTab('records_active_tab', 'all')

  // ── Data ──
  const [documents, setDocuments] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [pageError, setPageError] = useState('')

  // ── Download ──
  const [downloadingId,       setDownloadingId]       = useState(null)
  const [downloadAllProgress, setDownloadAllProgress] = useState({ active: false, current: 0, total: 0 })

  // ── Add modal ──
  const [addModalOpen,  setAddModalOpen]  = useState(false)
  const [addForm,       setAddForm]       = useState(EMPTY_FORM)
  const [addMeta,       setAddMeta]       = useState({})
  const [addContacts,   setAddContacts]   = useState([])
  const [addFile,       setAddFile]       = useState(null)
  const [isDragOver,    setIsDragOver]    = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // ── Edit modal ──
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editRecord,    setEditRecord]    = useState(null)
  const [editForm,      setEditForm]      = useState(EMPTY_FORM)
  const [editMeta,      setEditMeta]      = useState({})
  const [editContacts,  setEditContacts]  = useState([])
  const [editFile,      setEditFile]      = useState(null)
  const [editSaving,    setEditSaving]    = useState(false)
  const [editError,     setEditError]     = useState('')

  // ── Delete ──
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deleting,        setDeleting]        = useState(false)

  // ── Load data ──
  useEffect(() => { if (brewery?.id) loadDocuments() }, [brewery?.id])

  // Handle navigation state from TtbPage (COLA redirect card integration)
  useEffect(() => {
    if (!location.state) return
    if (location.state.category) {
      const slug  = SLUG_MAP[location.state.category] ?? location.state.category.toLowerCase().replace(/\s+/g, '_')
      const match = CATEGORIES.find(c => c.id === slug || c.label === location.state.category)
      if (match) setActiveCategory(match.id)
    }
    if (location.state.openAdd) {
      setAddForm(prev => ({ ...prev, type: location.state.type || '' }))
      setAddModalOpen(true)
    }
    window.history.replaceState({}, '')
  }, [])

  // Auto-save add draft while modal is open (includes metadata so it survives refresh)
  useEffect(() => {
    if (!addModalOpen) return
    addDraft.saveDraft({ ...addForm, _meta: addMeta })
  }, [addForm, addMeta, addModalOpen])

  async function loadDocuments() {
    setLoading(true)
    setPageError('')
    try {
      const { data, error } = await supabase
        .from('brewery_documents')
        .select('*')
        .eq('brewery_id', brewery.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setDocuments(data ?? [])
    } catch {
      setPageError('Could not load records. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Download (blob to downloads folder) ──────────────────────────────────────

  async function handleDownload(record) {
    try {
      setDownloadingId(record.id)
      const { data: signedUrlData, error } = await supabase.storage
        .from('brewery-documents')
        .createSignedUrl(record.file_path, 60)
      if (error) throw error
      const response = await fetch(signedUrlData.signedUrl)
      const blob     = await response.blob()
      const blobUrl  = URL.createObjectURL(blob)
      const link     = document.createElement('a')
      link.href      = blobUrl
      link.download  = record.document_name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch {
      setPageError('Download failed. Please try again.')
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Bulk download ─────────────────────────────────────────────────────────────

  async function handleDownloadAll() {
    const recordsWithFiles = filteredDocs.filter(r => r.file_path)
    if (recordsWithFiles.length === 0) return
    setDownloadAllProgress({ active: true, current: 0, total: recordsWithFiles.length })
    for (let i = 0; i < recordsWithFiles.length; i++) {
      setDownloadAllProgress({ active: true, current: i + 1, total: recordsWithFiles.length })
      await handleDownload(recordsWithFiles[i])
      if (i < recordsWithFiles.length - 1) await new Promise(r => setTimeout(r, 800))
    }
    setDownloadAllProgress({ active: false, current: 0, total: 0 })
  }

  // ── File validation ───────────────────────────────────────────────────────────

  function validateAndSetFile(file, setter, errorSetter) {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      errorSetter('File type not allowed. Please upload a PDF, JPG, PNG, DOC, or DOCX.')
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      errorSetter('File is too large. Maximum 25 MB.')
      return false
    }
    errorSetter('')
    setter(file)
    return true
  }

  // ── Add modal handlers ────────────────────────────────────────────────────────

  function openAddModal(showBanner = true) {
    const draft = addDraft.loadDraft(showBanner)
    if (draft) {
      const { _meta, ...formData } = draft
      setAddForm(prev => ({ ...prev, ...formData }))
      if (_meta && typeof _meta === 'object') setAddMeta(_meta)
    }
    setAddModalOpen(true)
  }

  function closeAddModal() {
    addDraft.clearDraft()
    setAddForm(EMPTY_FORM); setAddMeta({})
    setAddContacts([]); setAddFile(null)
    setUploadError(''); setUploadSuccess(false)
    setIsDragOver(false); setAddModalOpen(false)
  }

  async function handleAddSubmit(e) {
    e.preventDefault()
    if (!addFile || !addForm.name.trim() || !addForm.type) return
    setUploading(true); setUploadError(''); setUploadSuccess(false)
    try {
      const safeName = addFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${brewery.id}/${Date.now()}_${safeName}`
      const { error: storageErr } = await supabase.storage
        .from('brewery-documents')
        .upload(filePath, addFile, { contentType: addFile.type, upsert: false })
      if (storageErr) throw storageErr

      const { error: dbErr } = await supabase.from('brewery_documents').insert({
        brewery_id:      brewery.id,
        document_name:   addForm.name.trim(),
        document_type:   addForm.type,
        file_path:       filePath,
        file_size:       addFile.size,
        expiration_date: addForm.expiration_date || null,
        notes:           addForm.notes.trim() || null,
        contacts:        addContacts.filter(c => c.name.trim() || c.phone.trim() || c.email.trim()),
        metadata:        Object.keys(addMeta).length > 0 ? addMeta : null,
      })
      if (dbErr) {
        await supabase.storage.from('brewery-documents').remove([filePath])
        throw dbErr
      }

      addDraft.clearDraft()
      setUploadSuccess(true)
      setAddForm(EMPTY_FORM); setAddMeta({}); setAddContacts([]); setAddFile(null)
      await loadDocuments()
      setTimeout(() => closeAddModal(), 1500)
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── Edit modal handlers ───────────────────────────────────────────────────────

  function openEditModal(doc) {
    setEditRecord(doc)
    setEditForm({
      name:            doc.document_name,
      type:            doc.document_type,
      expiration_date: doc.expiration_date ?? '',
      notes:           doc.notes ?? '',
    })
    setEditMeta(doc.metadata && typeof doc.metadata === 'object' ? { ...doc.metadata } : {})
    setEditContacts(Array.isArray(doc.contacts) ? doc.contacts : [])
    setEditFile(null); setEditError(''); setEditModalOpen(true)
  }

  function closeEditModal() {
    setEditRecord(null)
    setEditForm(EMPTY_FORM); setEditMeta({}); setEditContacts([]); setEditFile(null)
    setEditError(''); setEditModalOpen(false)
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    if (!editRecord) return
    setEditSaving(true); setEditError('')
    try {
      const updates = {
        document_name:   editForm.name.trim(),
        document_type:   editForm.type,
        expiration_date: editForm.expiration_date || null,
        notes:           editForm.notes.trim() || null,
        contacts:        editContacts.filter(c => c.name.trim() || c.phone.trim() || c.email.trim()),
        metadata:        Object.keys(editMeta).length > 0 ? editMeta : null,
      }

      if (editFile) {
        const safeName = editFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const newPath  = `${brewery.id}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase.storage
          .from('brewery-documents')
          .upload(newPath, editFile, { contentType: editFile.type, upsert: false })
        if (upErr) throw upErr
        if (editRecord.file_path) {
          await supabase.storage.from('brewery-documents').remove([editRecord.file_path])
        }
        updates.file_path = newPath
        updates.file_size = editFile.size
      }

      const { error: dbErr } = await supabase
        .from('brewery_documents').update(updates).eq('id', editRecord.id)
      if (dbErr) throw dbErr
      await loadDocuments()
      closeEditModal()
    } catch (err) {
      setEditError(err.message || 'Could not save changes. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(docId, filePath) {
    setDeleting(true)
    try {
      if (filePath) await supabase.storage.from('brewery-documents').remove([filePath])
      const { error } = await supabase.from('brewery_documents').delete().eq('id', docId)
      if (error) throw error
      setDeleteConfirmId(null)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch {
      setPageError('Could not delete the record. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const filteredDocs = documents.filter(d => matchesCategory(d, activeCategory))

  const expiringCount = documents.filter(d => {
    const s = getExpirationStatus(d.expiration_date)
    return s === 'expired' || s === 'urgent' || s === 'warning'
  }).length

  const isAddFormDirty = !!(addForm.name.trim() || addForm.type || addForm.expiration_date || addForm.notes || addFile)
  const canAdd         = addForm.name.trim() && addForm.type && addFile

  if (loading) return <LoadingSpinner message="Loading brewery records..." />

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">🗂️ Brewery Records</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {filteredDocs.filter(r => r.file_path).length > 1 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloadAllProgress.active || !!downloadingId}
              className="border border-gray-300 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {downloadAllProgress.active
                ? `Downloading ${downloadAllProgress.current} of ${downloadAllProgress.total}…`
                : '⬇ Download All'}
            </button>
          )}
          <ReadOnlyTooltip isReadOnly={isReadOnly}>
            <button
              onClick={() => openAddModal(!addDraft.hasDraft)}
              disabled={isReadOnly}
              className="bg-amber hover:bg-amber-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors relative disabled:opacity-60"
            >
              {addDraft.hasDraft && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber rounded-full border-2 border-white" />
              )}
              {addDraft.hasDraft ? 'Continue Draft' : '+ Add Record'}
            </button>
          </ReadOnlyTooltip>
        </div>
      </div>

      {/* Expiring warning banner */}
      {expiringCount > 0 && (
        <div className="bg-red-50 border border-danger/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <p className="text-sm text-danger font-medium">
            {expiringCount} {expiringCount === 1 ? 'record is' : 'records are'} expiring soon or already expired — review and renew as needed.
          </p>
        </div>
      )}

      {/* Privacy notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-lg shrink-0">🔒</span>
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Your records are yours.</strong> Everything stored here is private to your brewery account.
          We never share your documents with third parties. Export or delete your data anytime in Account Settings.
        </p>
      </div>

      <DismissibleDisclaimer
        storageKey="disclaimer_records_dismissed"
        text="Document storage is a convenience tool. Always keep your own backup copies of all license, permit, and insurance documents."
      />

      {addDraft.hasDraft && !addModalOpen && (
        <DraftNoticeBar onContinue={() => openAddModal(false)} onDiscard={addDraft.clearDraft} />
      )}

      {pageError && <ErrorBar message={pageError} onDismiss={() => setPageError('')} />}

      {/* Category filter pills */}
      <div className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-1.5 min-w-max pb-1">
          {CATEGORIES.map(cat => {
            const count  = cat.id === 'all' ? documents.length : documents.filter(d => matchesCategory(d, cat.id)).length
            const active = activeCategory === cat.id
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {cat.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Record list */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-sm font-semibold text-navy mb-1">
            {activeCategory === 'all' ? 'No records added yet' : `No ${CATEGORIES.find(c => c.id === activeCategory)?.label} records`}
          </p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Upload your compliance documents, permits, insurance certificates, and agreements here.
          </p>
          <button onClick={() => openAddModal()} className="mt-4 text-sm text-amber hover:underline font-medium">
            Add a record →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map(doc => (
            <RecordCard
              key={doc.id}
              doc={doc}
              downloadingId={downloadingId}
              deleteConfirmId={deleteConfirmId}
              deleting={deleting}
              onDownload={handleDownload}
              onEdit={() => openEditModal(doc)}
              onDeleteRequest={setDeleteConfirmId}
              onDeleteConfirm={handleDelete}
              onDeleteCancel={() => setDeleteConfirmId(null)}
            />
          ))}
        </div>
      )}

      {/* ── Add Record modal ── */}
      <ModalShell
        isOpen={addModalOpen}
        onClose={closeAddModal}
        isDirty={isAddFormDirty}
        title="Add Record"
        draftRestored={addDraft.draftRestored}
        onDismissDraft={addDraft.dismissDraftBanner}
        maxWidth="max-w-2xl"
      >
        {uploadSuccess ? (
          <div className="py-10 text-center">
            <p className="text-5xl mb-3">✅</p>
            <p className="font-semibold text-navy text-lg">Record added!</p>
            <p className="text-sm text-gray-500 mt-1">Your document has been saved securely.</p>
          </div>
        ) : (
          <form onSubmit={handleAddSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FormField label="Record Name" required>
                  <input type="text" required placeholder="e.g. Brewer's Notice 2026" value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    className={inputCls} />
                </FormField>
              </div>

              <FormField label="Record Type" required>
                <DocTypeSelect required value={addForm.type}
                  onChange={e => setAddForm(p => ({ ...p, type: e.target.value }))} />
              </FormField>

              <FormField label="Expiration Date" optional>
                <input type="date" value={addForm.expiration_date}
                  onChange={e => setAddForm(p => ({ ...p, expiration_date: e.target.value }))}
                  className={inputCls} />
              </FormField>
            </div>

            <FormField label="Notes" optional hint="max 500 characters">
              <textarea placeholder="Any notes about this record..." value={addForm.notes} maxLength={500} rows={2}
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                className={inputCls + ' resize-none'} />
              <p className="text-xs text-gray-400 text-right mt-0.5">{addForm.notes.length}/500</p>
            </FormField>

            {/* Dynamic metadata fields */}
            {addForm.type && (
              <MetadataSection docType={addForm.type} meta={addMeta} onChange={setAddMeta} />
            )}

            {/* Contacts */}
            <div className="border-t border-gray-100 pt-4">
              <ContactsSection contacts={addContacts} onChange={setAddContacts} />
            </div>

            {/* File drop zone */}
            <div className="border-t border-gray-100 pt-4">
              <FormField label="File" required>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
                  onDrop={e => {
                    e.preventDefault(); setIsDragOver(false)
                    const f = e.dataTransfer.files[0]
                    if (f) validateAndSetFile(f, setAddFile, setUploadError)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors select-none ${
                    isDragOver ? 'border-amber bg-amber/10' : 'border-gray-300 hover:border-amber hover:bg-gray-50'
                  }`}
                >
                  {addFile ? (
                    <div>
                      <p className="text-sm font-semibold text-navy">📄 {addFile.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatFileSize(addFile.size)}</p>
                      <p className="text-xs text-amber mt-2">Click or drop to replace</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-3xl mb-2">📎</p>
                      <p className="text-sm text-gray-600">Drag & drop or <span className="text-amber font-medium">browse</span></p>
                      <p className="text-xs text-gray-400 mt-1.5">PDF, JPG, PNG, DOC, DOCX — max 25 MB</p>
                    </div>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={e => {
                    if (e.target.files[0]) validateAndSetFile(e.target.files[0], setAddFile, setUploadError)
                    e.target.value = ''
                  }}
                  className="hidden" />
              </FormField>
            </div>

            {uploadError && <ErrorBar message={uploadError} onDismiss={() => setUploadError('')} />}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeAddModal}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" disabled={!canAdd || uploading}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
                {uploading ? <Spinner label="Uploading..." /> : 'Add Record'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* ── Edit Record modal ── */}
      <ModalShell
        isOpen={editModalOpen}
        onClose={closeEditModal}
        isDirty={false}
        title="Edit Record"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FormField label="Record Name" required>
                <input type="text" required value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className={inputCls} />
              </FormField>
            </div>

            <FormField label="Record Type" required>
              <DocTypeSelect required value={editForm.type}
                onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))} />
            </FormField>

            <FormField label="Expiration Date" optional>
              <input type="date" value={editForm.expiration_date}
                onChange={e => setEditForm(p => ({ ...p, expiration_date: e.target.value }))}
                className={inputCls} />
            </FormField>
          </div>

          <FormField label="Notes" optional hint="max 500 characters">
            <textarea placeholder="Any notes about this record..." value={editForm.notes} maxLength={500} rows={2}
              onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
              className={inputCls + ' resize-none'} />
            <p className="text-xs text-gray-400 text-right mt-0.5">{editForm.notes.length}/500</p>
          </FormField>

          {/* Dynamic metadata fields */}
          {editForm.type && (
            <MetadataSection docType={editForm.type} meta={editMeta} onChange={setEditMeta} />
          )}

          {/* Contacts */}
          <div className="border-t border-gray-100 pt-4">
            <ContactsSection contacts={editContacts} onChange={setEditContacts} />
          </div>

          {/* File replacement */}
          <div className="border-t border-gray-100 pt-4">
            <FormField label="Replace File" optional>
              {editRecord?.document_name && !editFile && (
                <p className="text-xs text-gray-500 mb-2">Current file: {editRecord.document_name}</p>
              )}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) validateAndSetFile(f, setEditFile, setEditError)
                }}
                onClick={() => editFileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg px-4 py-4 text-center cursor-pointer hover:border-amber hover:bg-gray-50 transition-colors select-none"
              >
                {editFile ? (
                  <p className="text-sm font-semibold text-navy">📄 {editFile.name} ({formatFileSize(editFile.size)})</p>
                ) : (
                  <p className="text-sm text-gray-500">Drop a replacement file here or <span className="text-amber">browse</span></p>
                )}
              </div>
              <input ref={editFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => {
                  if (e.target.files[0]) validateAndSetFile(e.target.files[0], setEditFile, setEditError)
                  e.target.value = ''
                }}
                className="hidden" />
            </FormField>
          </div>

          {editError && <ErrorBar message={editError} onDismiss={() => setEditError('')} />}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeEditModal}
              className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={editSaving}
              className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60">
              {editSaving ? <Spinner label="Saving..." /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </ModalShell>

    </div>
  )
}

// ─── RecordCard ───────────────────────────────────────────────────────────────

function RecordCard({ doc, downloadingId, deleteConfirmId, deleting, onDownload, onEdit, onDeleteRequest, onDeleteConfirm, onDeleteCancel }) {
  const expStatus     = getExpirationStatus(doc.expiration_date)
  const isConfirming  = deleteConfirmId === doc.id
  const isDownloading = downloadingId   === doc.id

  const expCls = { expired: 'text-danger font-semibold', urgent: 'text-danger', warning: 'text-warning', ok: 'text-success' }

  const primaryContact = Array.isArray(doc.contacts) && doc.contacts.length > 0 ? doc.contacts[0] : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2.5">
      {/* Name + type */}
      <div>
        <p className="font-semibold text-navy text-sm truncate" title={doc.document_name}>{doc.document_name}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-xs bg-amber/10 text-amber font-medium px-2 py-0.5 rounded-full">
            {doc.document_type}
          </span>
          {doc.file_size && <span className="text-xs text-gray-400">{formatFileSize(doc.file_size)}</span>}
        </div>
      </div>

      {/* Expiration */}
      {doc.expiration_date && (
        <p className={`text-xs ${expCls[expStatus]}`}>
          {expStatus === 'expired' ? '⚠️ Expired: ' : '📅 Expires: '}
          {formatDate(doc.expiration_date)}
          {expStatus === 'urgent'  && ' — expiring soon!'}
          {expStatus === 'expired' && ' — renewal required'}
        </p>
      )}

      {/* Primary contact */}
      {primaryContact?.name && (
        <p className="text-xs text-gray-500">
          👤 {primaryContact.name}
          {primaryContact.phone && <span className="ml-2 text-gray-400">{primaryContact.phone}</span>}
        </p>
      )}

      {/* Notes */}
      {doc.notes && (
        <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-2">{doc.notes}</p>
      )}

      <p className="text-xs text-gray-400">Added {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>

      {/* Actions */}
      {isConfirming ? (
        <div className="border-t border-gray-100 pt-2.5 space-y-2">
          <p className="text-xs text-gray-700 font-medium">Delete this record? This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={() => onDeleteConfirm(doc.id, doc.file_path)} disabled={deleting}
              className="flex-1 bg-danger text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
            <button onClick={onDeleteCancel}
              className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t border-gray-100 pt-2.5 mt-auto">
          {doc.file_path && (
            <button onClick={() => onDownload(doc)} disabled={!!downloadingId}
              className="flex-1 bg-navy text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-navy-light transition-colors disabled:opacity-60">
              {isDownloading ? '⏳ Saving...' : '⬇ Download'}
            </button>
          )}
          <button onClick={onEdit}
            className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">
            Edit
          </button>
          <button onClick={() => onDeleteRequest(doc.id)}
            className="px-3 py-1.5 border border-gray-300 text-gray-500 text-xs rounded-lg hover:border-danger hover:text-danger transition-colors">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
