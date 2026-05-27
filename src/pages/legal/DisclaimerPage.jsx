import { Link } from 'react-router-dom'

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-gray-light px-4 py-10">
      <div className="max-w-[800px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8 md:p-12">

        {/* Back button */}
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm text-amber hover:underline mb-6 block"
        >
          ← Back
        </Link>

        {/* Header */}
        <h1 className="text-3xl font-bold text-navy mb-1">Disclaimer</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 2026</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">1. Information Only — Not Professional Advice</h2>
            <p>
              The Craft Beer Brief Essentials ("the app," "we," "us") is a software tool designed to
              help craft brewery owners organize information, track deadlines, and plan operations. All
              content, data, calculations, and outputs provided by this app are for informational and
              organizational purposes only.
            </p>
            <p className="mt-3">
              Nothing in this app constitutes legal advice, tax advice, compliance advice, financial
              advice, or any other form of professional advice. Use of this app does not create an
              attorney-client, accountant-client, or any other professional relationship between you
              and The Craft Beer Brief.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">2. TTB and Regulatory Information</h2>
            <p>
              Information related to the Alcohol and Tobacco Tax and Trade Bureau (TTB), federal
              excise taxes, Certificates of Label Approval (COLAs), Brewer's Notices, and related
              regulatory matters is provided for general informational purposes only. Federal
              regulations change frequently and the information in this app may not reflect the most
              current requirements.
            </p>
            <p className="mt-3">
              This app does not file, submit, or communicate with the TTB or any government agency on
              your behalf. All compliance filings, tax payments, and regulatory submissions remain
              your sole responsibility. Always verify current requirements directly at{' '}
              <a
                href="https://www.ttb.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber hover:underline"
              >
                ttb.gov
              </a>{' '}
              and consult a licensed alcohol beverage attorney or CPA before taking any compliance
              action.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">3. Excise Tax Calculator</h2>
            <p>
              The Excise Tax Calculator feature provides estimates based on the federal excise tax
              rates entered in the calculator and the barrel quantities you provide. These calculations
              are estimates only and do not account for CBMA (Craft Beverage Modernization Act)
              credits, state-level excise taxes, amendments, or other adjustments that may affect your
              actual tax liability.
            </p>
            <p className="mt-3">
              Do not rely on calculator outputs as your final tax liability. Always consult a
              qualified CPA or tax professional and file directly through the TTB's official payment
              systems.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">4. Grant and Funding Information</h2>
            <p>
              Grant and funding program listings in the Grant Finder are researched and curated by
              The Craft Beer Brief team and are updated on a quarterly basis. However, grant program
              availability, eligibility requirements, application deadlines, and funding amounts
              change frequently and without notice.
            </p>
            <p className="mt-3">
              We make no warranty that any grant listing is current, accurate, or that your brewery
              will qualify for any listed program. Always verify program details directly with the
              funding agency before applying. The inclusion of a program in our database does not
              constitute an endorsement or guarantee of funding.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">5. Compliance Calendar and Deadline Data</h2>
            <p>
              Compliance deadlines pre-populated in the Compliance Calendar are based on general
              state and federal licensing requirements researched by our team. These deadlines are
              provided as a starting point only and may not reflect your specific license types,
              business structure, local jurisdiction requirements, or recent regulatory changes.
            </p>
            <p className="mt-3">
              You are solely responsible for verifying all compliance deadlines with the appropriate
              regulatory authorities and ensuring that all filings are made on time. Missing a
              compliance deadline may result in fines, license suspension, or other penalties for
              which The Craft Beer Brief bears no liability.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">6. Water Chemistry Calculator</h2>
            <p>
              The Water Chemistry Calculator provides mineral addition estimates based on your source
              water profile and selected style targets. These are general guidelines based on commonly
              accepted brewing chemistry ranges. Results may vary based on your actual water chemistry,
              equipment, process, and other factors.
            </p>
            <p className="mt-3">
              Always consult current brewing science resources and test your actual water before
              making significant changes to your brewing process. We make no warranty that following
              the calculator's suggested mineral additions will produce any specific flavor profile or
              meet any regulatory standard.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">7. Financial Calculations and Profitability Data</h2>
            <p>
              Cost per pint calculations, batch profitability reports, margin estimates, and other
              financial figures generated by this app are based entirely on the data you enter. The
              accuracy of these outputs depends on the accuracy and completeness of your input data.
            </p>
            <p className="mt-3">
              These figures are planning tools only and should not be used as the basis for financial
              statements, tax returns, loan applications, or other formal financial documents without
              independent verification by a qualified accounting professional.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">8. State and Local Laws</h2>
            <p>
              Alcohol beverage laws vary significantly across all 50 states and individual
              municipalities. Information in this app about self-distribution rights, taproom sales,
              franchise law, direct-to-consumer shipping, and other state-specific topics is provided
              for general awareness only. It does not constitute legal advice and may not reflect
              current law in your jurisdiction.
            </p>
            <p className="mt-3">
              Always consult a licensed alcohol beverage attorney in your state before entering into
              distribution agreements, making changes to your sales channels, or taking any action
              based on state regulatory information provided by this app.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">9. AI Assistant</h2>
            <p>
              The Craft Brief AI Assistant is powered by a large language model and is designed to
              help with app navigation, general brewery operations questions, and informational
              guidance. Responses from the AI assistant are generated automatically and may contain
              errors, outdated information, or omissions.
            </p>
            <p className="mt-3">
              The AI assistant does not provide legal advice, tax advice, or compliance advice. Do
              not rely on AI assistant responses as a substitute for qualified professional counsel.
              The assistant cannot access your actual brewery data and does not know your specific
              regulatory situation.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">10. Limitation of Liability and Contact</h2>
            <p>
              To the fullest extent permitted by law, The Craft Beer Brief and its operators disclaim
              all liability for any direct, indirect, incidental, or consequential damages arising
              from your use of this app, reliance on any information provided, missed compliance
              deadlines, or errors in calculations or data. Your use of the app is entirely at your
              own risk.
            </p>
            <p className="mt-3">
              If you have questions about this disclaimer or our policies, please contact us at{' '}
              <a href="mailto:hello@thecraftbeerbrief.com" className="text-amber hover:underline">
                hello@thecraftbeerbrief.com
              </a>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
