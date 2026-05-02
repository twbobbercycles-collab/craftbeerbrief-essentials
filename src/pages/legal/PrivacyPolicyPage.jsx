import { Link } from 'react-router-dom'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-light px-4 py-10">
      <div className="max-w-[800px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8 md:p-12">

        {/* Back button */}
        <Link
          to="/signup"
          className="inline-flex items-center gap-1.5 text-sm text-amber hover:underline mb-6 block"
        >
          ← Back
        </Link>

        {/* Header */}
        <h1 className="text-3xl font-bold text-navy mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 2026</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">1. Who We Are</h2>
            <p>
              The Craft Beer Brief Essentials ("we," "us," or "our") is a software-as-a-service
              application designed to help small craft brewery owners track compliance deadlines,
              manage license documents, file TTB excise tax reports, and discover grant funding
              opportunities. We are operated by The Craft Beer Brief.
            </p>
            <p className="mt-3">
              If you have any questions about this Privacy Policy or how we handle your data, you
              can reach us at{' '}
              <a href="mailto:craftbeerbrief@gmail.com" className="text-amber hover:underline">
                craftbeerbrief@gmail.com
              </a>.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">2. What We Collect</h2>
            <p>We collect the following categories of information when you use the app:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>
                <strong>Account information:</strong> Your email address and password (stored
                securely via Supabase Auth with bcrypt hashing).
              </li>
              <li>
                <strong>Brewery profile:</strong> Your brewery name, state, license types, and
                any other profile details you choose to enter.
              </li>
              <li>
                <strong>Compliance data:</strong> Deadline dates, filing periods, TTB excise tax
                report data, and any notes you add to compliance items.
              </li>
              <li>
                <strong>Billing information:</strong> Your subscription status and payment history.
                We do not store credit card numbers — all payment processing is handled by Stripe.
              </li>
              <li>
                <strong>Usage data:</strong> Basic logs of how you interact with the application
                (pages visited, features used) for the purpose of improving the product.
              </li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">3. How We Use Your Data</h2>
            <p>We use your data solely to provide and improve the Craft Beer Brief Essentials service. Specifically:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>To authenticate you and secure your account.</li>
              <li>To display your brewery's compliance deadlines, TTB filings, and grant matches.</li>
              <li>To process your subscription payment through Stripe.</li>
              <li>To send transactional emails (account confirmation, password reset).</li>
              <li>To improve the accuracy of our compliance calendar and grant database.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal data to third parties. We do not use your data for
              advertising or share it with data brokers.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">4. Your Documents and Files</h2>
            <p>
              Files you upload to the Document Storage feature (such as your Brewer's Notice,
              state licenses, and permits) are stored in a private, encrypted Supabase Storage
              bucket. Access is restricted exclusively to your brewery account using row-level
              security policies. Files are never shared with other users or third parties.
            </p>
            <p className="mt-3 font-semibold text-navy">
              Your documents are yours. You own them completely.
            </p>
            <p className="mt-2">
              You can download or delete any document at any time from within the app. If you
              close your account, all of your stored files will be permanently deleted from our
              servers within 30 days.
            </p>
            <p className="mt-3">
              We recommend always maintaining your own independent backup copies of all important
              license and permit documents. While we take data security seriously, no cloud
              storage system is guaranteed to be free from data loss.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">5. Data Security</h2>
            <p>We take reasonable technical and organizational measures to protect your data, including:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>All data is transmitted over HTTPS (TLS encryption in transit).</li>
              <li>Database storage is encrypted at rest via Supabase (AES-256).</li>
              <li>Passwords are hashed with bcrypt and never stored in plain text.</li>
              <li>Row-level security (RLS) policies ensure each brewery can only access its own data.</li>
              <li>File storage uses signed URLs with short expiry times (1 hour) for all downloads.</li>
            </ul>
            <p className="mt-3">
              Despite these precautions, no system is 100% secure. We encourage you to use a
              strong, unique password and to contact us immediately if you suspect unauthorized
              access to your account.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">6. Data Retention</h2>
            <p>
              We retain your account data and uploaded documents for as long as your account
              is active. If you cancel your subscription, your data will remain accessible
              until the end of your current billing period.
            </p>
            <p className="mt-3">
              If you request account deletion by contacting us, we will permanently delete your
              account, brewery profile, compliance data, and all uploaded files within 30 days.
              Stripe retains your billing history separately as required by financial regulations.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">7. Cookies and Local Storage</h2>
            <p>
              We use browser local storage (not third-party cookies) to remember your UI
              preferences, such as whether you have dismissed certain informational banners.
              This data never leaves your browser and is not shared with us or any third party.
            </p>
            <p className="mt-3">
              Supabase Auth uses a session cookie to keep you logged in between page visits.
              This is a strictly necessary, first-party cookie and does not track you across
              other websites.
            </p>
            <p className="mt-3">
              We do not use advertising cookies, analytics cookies from Google Analytics, or any
              third-party tracking cookies.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">8. Contact Us</h2>
            <p>
              If you have questions, concerns, or requests related to your privacy or your data,
              please contact us:
            </p>
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-4 space-y-1">
              <p><strong>The Craft Beer Brief</strong></p>
              <p>
                Email:{' '}
                <a href="mailto:craftbeerbrief@gmail.com" className="text-amber hover:underline">
                  craftbeerbrief@gmail.com
                </a>
              </p>
            </div>
            <p className="mt-4 text-gray-500 text-xs">
              We will respond to all privacy-related requests within 30 days.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
