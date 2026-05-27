import { Link } from 'react-router-dom'

export default function TermsOfServicePage() {
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
        <h1 className="text-3xl font-bold text-navy mb-1">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 27, 2026</p>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using The Craft Beer Brief Essentials application ("the App") you agree
              to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms do
              not use the App. These Terms constitute a legally binding agreement between you and The
              Craft Beer Brief ("we," "us," or "our").
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">2. Description of Service</h2>
            <p>
              The Craft Beer Brief Essentials is a subscription-based software application providing
              brewery compliance tracking, operations management, and advocacy tools for craft brewery
              owners and operators. The App includes compliance calendars, grant finders, TTB tracking
              tools, recipe builders, inventory management, fermentation tracking, packaging tools,
              distribution management, event planning, wholesale management, staff training tracking,
              revenue benchmarking, regulation playbook templates, and an AI assistant.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">3. Subscription Plans and Payment</h2>
            <p>The App is offered on a subscription basis with the following plans:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li><strong>Essentials:</strong> $9.99/month or $99.99/year</li>
              <li><strong>Operations:</strong> $14.99/month or $149.99/year</li>
              <li><strong>Full Suite:</strong> $19.99/month or $199.99/year</li>
            </ul>
            <p className="mt-3">
              A 14-day free trial of the Operations tier is available to new subscribers. No credit
              card is required during the trial period. After the trial you may subscribe to any plan
              or allow your account to expire.
            </p>
            <p className="mt-3">
              Subscriptions are billed in advance on a recurring basis. You authorize us to charge
              your payment method on file at the start of each billing period. All fees are
              non-refundable except as required by law or as described in our refund policy. We
              reserve the right to change subscription prices with 30 days notice to active
              subscribers.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">4. Intellectual Property and Prohibited Uses</h2>
            <p>
              All content in the App including but not limited to the Regulation Policy and Advocacy
              Playbook, all 26 document templates, compliance data, grant listings, regulatory
              guidance, software code, and AI assistant responses are the proprietary intellectual
              property of The Craft Beer Brief and are protected by copyright and other intellectual
              property laws.
            </p>
            <p className="mt-3">
              You are granted a limited, non-exclusive, non-transferable license to use the App and
              its content for your own brewery's internal business purposes only.
            </p>
            <p className="mt-3">You expressly agree NOT to:</p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>
                Copy, reproduce, distribute, or republish any content from the App including playbook
                content, templates, or compliance data
              </li>
              <li>
                Use content from the App to develop, build, or contribute to any competing product or
                service
              </li>
              <li>
                Share your login credentials with competitors or allow competitors to access the App
                through your account
              </li>
              <li>
                Scrape, bulk download, or systematically extract content from the App
              </li>
              <li>
                Reverse engineer, decompile, or attempt to extract the source code of the App
              </li>
              <li>Remove or alter any copyright, trademark, or proprietary notices</li>
              <li>Use the App or its content for any unlawful purpose</li>
            </ul>
            <p className="mt-3">
              Violation of these terms will result in immediate termination of your subscription
              without refund and may result in legal action.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">5. User Data and Content</h2>
            <p>
              You retain ownership of all data you enter into the App including brewery information,
              recipes, inventory, and operational data. You grant us a limited license to store,
              process, and display your data solely for the purpose of providing the App services. We
              will not sell your data to third parties. See our{' '}
              <Link to="/privacy-policy" className="text-amber hover:underline">
                Privacy Policy
              </Link>{' '}
              for complete details on how we handle your data.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">6. AI Assistant Terms</h2>
            <p>
              The Craft Brief AI Assistant is powered by third-party artificial intelligence
              technology. By using the AI assistant you acknowledge:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2">
              <li>AI responses may contain errors or inaccuracies</li>
              <li>
                AI responses do not constitute legal, tax, or regulatory advice
              </li>
              <li>
                You will not attempt to manipulate the AI to produce harmful, illegal, or
                inappropriate content
              </li>
              <li>
                Conversation data may be processed by our AI provider subject to their terms
              </li>
              <li>
                AI assistant access is limited to paying subscribers and subject to daily usage
                limits by tier
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">7. Disclaimer of Warranties</h2>
            <p className="uppercase tracking-wide text-xs leading-relaxed">
              THE APP IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY
              KIND EITHER EXPRESS OR IMPLIED INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. WE DO NOT
              WARRANT THAT THE APP WILL BE UNINTERRUPTED ERROR-FREE OR COMPLETELY SECURE.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">8. Limitation of Liability</h2>
            <p className="uppercase tracking-wide text-xs leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW THE CRAFT BEER BRIEF SHALL NOT BE
              LIABLE FOR ANY INDIRECT INCIDENTAL SPECIAL CONSEQUENTIAL OR PUNITIVE DAMAGES INCLUDING
              LOST PROFITS LOST DATA OR BUSINESS INTERRUPTION ARISING FROM YOUR USE OF THE APP OR
              RELIANCE ON ANY INFORMATION PROVIDED HEREIN. OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING
              FROM THESE TERMS OR YOUR USE OF THE APP SHALL NOT EXCEED THE SUBSCRIPTION FEES YOU PAID
              IN THE THREE MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">9. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless The Craft Beer Brief and its owner from any
              claims, damages, losses, liabilities, and expenses (including reasonable attorney fees)
              arising from your use of the App, your violation of these Terms, or your violation of
              any third party rights.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">10. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violation of
              these Terms. You may cancel your subscription at any time through Account Settings. Upon
              termination your access to the App will cease at the end of your current billing period.
              Your data will be retained for 90 days after termination and then deleted. We reserve
              the right to terminate accounts we believe are being used by competitors to copy our
              content or for any purpose that violates these Terms.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">11. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              Commonwealth of Pennsylvania without regard to its conflict of law provisions. Any
              disputes arising from these Terms shall be resolved in the courts of Pennsylvania.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify active
              subscribers of material changes by email at least 30 days before they take effect.
              Continued use of the App after changes take effect constitutes acceptance of the revised
              Terms.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-lg font-bold text-navy mb-3">13. Contact</h2>
            <p>
              For questions about these Terms contact{' '}
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
