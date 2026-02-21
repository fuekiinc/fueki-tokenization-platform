import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import FuekiBrand from '../components/Brand/FuekiBrand';

// ---------------------------------------------------------------------------
// PrivacyPage
// ---------------------------------------------------------------------------

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#06070A]">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="w-full border-b border-white/[0.06] bg-[#06070A]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link
            to="/"
            className={clsx(
              'inline-flex items-center gap-2 text-sm font-medium',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              'transition-colors duration-200',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <FuekiBrand
            variant="full"
            className="justify-center"
            imageClassName="h-8 w-auto drop-shadow-[0_8px_18px_rgba(8,24,38,0.35)]"
          />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main Content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title block */}
        <div className="mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
              Privacy Policy
            </span>
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Last updated: February 19, 2026
          </p>
        </div>

        {/* Policy card */}
        <div
          className={clsx(
            'bg-white/[0.02] backdrop-blur-xl',
            'border border-white/[0.06]',
            'rounded-2xl sm:rounded-3xl',
            'shadow-2xl shadow-black/20',
            'px-6 sm:px-10 lg:px-14 py-10 sm:py-14',
          )}
        >
          <div className="space-y-10">
            {/* -------------------------------------------------------------- */}
            {/* 1. Introduction                                                 */}
            {/* -------------------------------------------------------------- */}
            <Section number="1" title="Introduction">
              <p>
                Fueki Technologies, Inc. (&quot;Fueki,&quot; &quot;we,&quot;
                &quot;us,&quot; or &quot;our&quot;) operates an
                institutional-grade digital asset tokenization platform that
                enables users to create, manage, transfer, and trade security
                tokens on the Ethereum blockchain (the &quot;Platform&quot;).
              </p>
              <p>
                This Privacy Policy describes how we collect, use, store, share,
                and protect your personal information when you access or use our
                Platform, website, mobile applications, APIs, and any related
                services (collectively, the &quot;Services&quot;). By accessing
                or using our Services, you acknowledge that you have read and
                understood this Privacy Policy.
              </p>
              <p>
                We are committed to protecting your privacy and handling your
                data in a transparent, secure, and lawful manner. If you have any
                questions about this policy or our data practices, please contact
                us using the information provided in Section 14 below.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 2. Information We Collect                                        */}
            {/* -------------------------------------------------------------- */}
            <Section number="2" title="Information We Collect">
              <p>
                We collect and process the following categories of information in
                connection with providing our Services:
              </p>

              <SubSection title="2.1 Personal Information">
                <p>
                  When you create an account or use our Services, we may collect
                  personal information including but not limited to:
                </p>
                <ul>
                  <li>Full legal name (first name, middle name, last name)</li>
                  <li>Email address</li>
                  <li>Date of birth</li>
                  <li>Phone number</li>
                  <li>
                    Residential address (street address, city, state, zip code,
                    country)
                  </li>
                  <li>
                    Social Security Number (SSN) or equivalent tax
                    identification number, as required for Know Your Customer
                    (KYC) and Anti-Money Laundering (AML) compliance
                  </li>
                </ul>
              </SubSection>

              <SubSection title="2.2 Identity Verification Documents">
                <p>
                  To comply with applicable securities regulations and KYC/AML
                  requirements, we collect copies of government-issued
                  identification documents, which may include:
                </p>
                <ul>
                  <li>Driver&apos;s license</li>
                  <li>Passport</li>
                  <li>National identity card</li>
                  <li>Other government-issued photo identification</li>
                </ul>
                <p>
                  These documents are used solely for the purpose of verifying
                  your identity and complying with regulatory obligations.
                </p>
              </SubSection>

              <SubSection title="2.3 Financial Information">
                <p>
                  In connection with your use of the Platform, we may collect
                  financial information including:
                </p>
                <ul>
                  <li>
                    Ethereum wallet addresses and other blockchain-related
                    identifiers
                  </li>
                  <li>
                    Transaction history on the Platform, including token
                    creation, transfers, and trades
                  </li>
                  <li>
                    Subscription plan details and payment history
                  </li>
                  <li>
                    Token holdings and portfolio information
                  </li>
                </ul>
              </SubSection>

              <SubSection title="2.4 Technical Data">
                <p>
                  We automatically collect certain technical information when you
                  access our Services, including:
                </p>
                <ul>
                  <li>IP address</li>
                  <li>Browser type and version</li>
                  <li>Operating system and device information</li>
                  <li>Screen resolution and viewport dimensions</li>
                  <li>Referring URLs and exit pages</li>
                  <li>Timestamps and session duration</li>
                </ul>
              </SubSection>

              <SubSection title="2.5 Usage Data">
                <p>
                  We collect information about how you interact with our
                  Platform, including:
                </p>
                <ul>
                  <li>Pages and features visited or used</li>
                  <li>Actions taken within the Platform (e.g., token deployments, trades executed)</li>
                  <li>Frequency and patterns of use</li>
                  <li>Error logs and performance data</li>
                  <li>Search queries and filter selections</li>
                </ul>
              </SubSection>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 3. How We Use Your Information                                  */}
            {/* -------------------------------------------------------------- */}
            <Section number="3" title="How We Use Your Information">
              <p>
                We use the information we collect for the following purposes:
              </p>
              <ul>
                <li>
                  <strong>KYC/AML Compliance:</strong> To verify your identity,
                  assess risk, and comply with applicable Know Your Customer,
                  Anti-Money Laundering, and Counter-Terrorism Financing
                  regulations.
                </li>
                <li>
                  <strong>Account Management:</strong> To create, maintain, and
                  administer your account, process your subscription, and
                  provide customer support.
                </li>
                <li>
                  <strong>Platform Operation:</strong> To facilitate the
                  creation, management, transfer, and trading of security tokens,
                  including processing transactions on the Ethereum blockchain.
                </li>
                <li>
                  <strong>Communication:</strong> To send you service-related
                  notifications, security alerts, account updates, and
                  regulatory disclosures. We may also send promotional
                  communications where you have opted in to receive them.
                </li>
                <li>
                  <strong>Security and Fraud Prevention:</strong> To detect,
                  investigate, and prevent fraudulent transactions, unauthorized
                  access, and other illegal activities, and to protect the
                  rights and safety of our users and the Platform.
                </li>
                <li>
                  <strong>Legal Compliance:</strong> To comply with applicable
                  laws, regulations, legal processes, and governmental requests,
                  including securities regulations, tax reporting obligations,
                  and court orders.
                </li>
                <li>
                  <strong>Platform Improvement:</strong> To analyze usage
                  patterns, diagnose technical issues, and improve the
                  functionality, performance, and user experience of our
                  Services.
                </li>
              </ul>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 4. Legal Basis for Processing                                   */}
            {/* -------------------------------------------------------------- */}
            <Section number="4" title="Legal Basis for Processing">
              <p>
                We process your personal information on the following legal
                bases:
              </p>
              <ul>
                <li>
                  <strong>Contractual Necessity:</strong> Processing is necessary
                  for the performance of the contract between you and Fueki,
                  including the provision of our Services, account management,
                  and transaction processing.
                </li>
                <li>
                  <strong>Legal Obligation:</strong> Processing is required to
                  comply with our legal and regulatory obligations, including but
                  not limited to securities regulations (such as SEC and FINRA
                  requirements), Anti-Money Laundering (AML) laws, Know Your
                  Customer (KYC) regulations, and tax reporting requirements.
                </li>
                <li>
                  <strong>Legitimate Interests:</strong> Processing is necessary
                  for our legitimate interests, including fraud prevention,
                  platform security, service improvement, and business
                  operations, provided such interests are not overridden by your
                  fundamental rights and freedoms.
                </li>
                <li>
                  <strong>Consent:</strong> Where required by applicable law, we
                  obtain your explicit consent before processing your personal
                  information for specific purposes, such as marketing
                  communications. You may withdraw your consent at any time
                  without affecting the lawfulness of processing based on
                  consent before its withdrawal.
                </li>
              </ul>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 5. Data Storage & Security                                      */}
            {/* -------------------------------------------------------------- */}
            <Section number="5" title="Data Storage and Security">
              <p>
                We take the security of your personal information seriously and
                implement appropriate technical and organizational measures to
                protect it against unauthorized access, alteration, disclosure,
                or destruction.
              </p>
              <ul>
                <li>
                  <strong>Encryption:</strong> All personally identifiable
                  information (PII), including identity documents and Social
                  Security Numbers, is encrypted at rest using AES-256
                  encryption. Data in transit is protected using TLS 1.2 or
                  higher.
                </li>
                <li>
                  <strong>Infrastructure:</strong> Our Services are hosted on
                  secure cloud infrastructure with industry-standard physical,
                  environmental, and operational security controls.
                </li>
                <li>
                  <strong>Access Controls:</strong> Access to personal data is
                  restricted to authorized personnel on a need-to-know basis.
                  We implement role-based access controls, multi-factor
                  authentication, and audit logging for all administrative
                  access.
                </li>
                <li>
                  <strong>Data Retention:</strong> We retain your personal
                  information only for as long as necessary to fulfill the
                  purposes for which it was collected, comply with legal and
                  regulatory obligations, resolve disputes, and enforce our
                  agreements. Specific retention periods are described in
                  Section 11.
                </li>
                <li>
                  <strong>Incident Response:</strong> We maintain a data breach
                  response plan and will notify affected users and relevant
                  authorities in accordance with applicable law in the event of
                  a security incident involving personal data.
                </li>
              </ul>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 6. Sharing Your Information                                     */}
            {/* -------------------------------------------------------------- */}
            <Section number="6" title="Sharing Your Information">
              <p>
                We may share your personal information in the following
                circumstances:
              </p>
              <ul>
                <li>
                  <strong>Regulatory Authorities:</strong> We may disclose your
                  information to securities regulators, financial authorities,
                  law enforcement agencies, and other governmental bodies as
                  required by applicable law or in response to valid legal
                  process.
                </li>
                <li>
                  <strong>KYC/AML Service Providers:</strong> We share
                  information with trusted third-party identity verification and
                  compliance service providers who assist us in performing KYC
                  checks, AML screening, and sanctions list monitoring. These
                  providers are contractually obligated to protect your data and
                  may only use it for the purposes specified by Fueki.
                </li>
                <li>
                  <strong>Blockchain Networks:</strong> When you execute
                  transactions on the Ethereum blockchain or other supported
                  networks, your public wallet address and transaction details
                  are recorded on the public blockchain. Please refer to
                  Section 7 for further information about blockchain data.
                </li>
                <li>
                  <strong>Legal Requirements:</strong> We may disclose your
                  information if required to do so by law, or in the good faith
                  belief that such action is necessary to comply with a legal
                  obligation, protect and defend our rights or property, prevent
                  fraud, or protect the personal safety of our users or the
                  public.
                </li>
                <li>
                  <strong>Business Transfers:</strong> In the event of a merger,
                  acquisition, reorganization, bankruptcy, or sale of all or a
                  portion of our assets, your personal information may be
                  transferred as part of that transaction. We will notify you
                  of any such change and any choices you may have regarding your
                  information.
                </li>
              </ul>
              <p className="font-semibold text-[var(--text-primary)]">
                We do not sell, rent, or trade your personal information to third
                parties for their marketing purposes.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 7. Blockchain Data                                              */}
            {/* -------------------------------------------------------------- */}
            <Section number="7" title="Blockchain Data">
              <p>
                Our Platform operates on the Ethereum blockchain and potentially
                other distributed ledger technologies. It is important that you
                understand the following characteristics of blockchain-based
                transactions:
              </p>
              <ul>
                <li>
                  <strong>Public Nature:</strong> Blockchain networks are
                  inherently public and decentralized. When you execute a
                  transaction (such as deploying, transferring, or trading a
                  security token), your wallet address and the transaction
                  details are recorded on the public blockchain and are visible
                  to anyone.
                </li>
                <li>
                  <strong>Immutability:</strong> Transactions recorded on a
                  blockchain are generally immutable, meaning they cannot be
                  altered, amended, or deleted once confirmed. Fueki has no
                  ability to modify or erase blockchain transaction data.
                </li>
                <li>
                  <strong>Pseudonymity:</strong> While wallet addresses are
                  pseudonymous, they may potentially be linked to your identity
                  through various means, including but not limited to blockchain
                  analytics, KYC records, and publicly available information.
                </li>
              </ul>
              <p>
                We strongly encourage you to consider these factors when using
                blockchain-based services and to exercise appropriate caution
                when sharing your wallet address publicly.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 8. International Data Transfers                                 */}
            {/* -------------------------------------------------------------- */}
            <Section number="8" title="International Data Transfers">
              <p>
                Fueki is headquartered in the United States, and your personal
                information may be processed and stored in the United States or
                other jurisdictions where our service providers operate. These
                jurisdictions may have data protection laws that differ from
                those of your country of residence.
              </p>
              <p>
                Where we transfer personal data outside of your jurisdiction, we
                implement appropriate safeguards to ensure that your information
                receives an adequate level of protection, including:
              </p>
              <ul>
                <li>Standard contractual clauses approved by relevant authorities</li>
                <li>Data processing agreements with our service providers</li>
                <li>Compliance with applicable data transfer frameworks</li>
              </ul>
              <p>
                By using our Services, you acknowledge and consent to the
                transfer, processing, and storage of your information in the
                United States and other jurisdictions as described in this
                Policy.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 9. Your Rights                                                  */}
            {/* -------------------------------------------------------------- */}
            <Section number="9" title="Your Rights">
              <p>
                Depending on your jurisdiction, you may have the following rights
                with respect to your personal information:
              </p>
              <ul>
                <li>
                  <strong>Right of Access:</strong> You have the right to request
                  a copy of the personal information we hold about you and
                  information about how we process it.
                </li>
                <li>
                  <strong>Right to Correction:</strong> You have the right to
                  request that we correct any inaccurate or incomplete personal
                  information we hold about you.
                </li>
                <li>
                  <strong>Right to Deletion:</strong> You have the right to
                  request that we delete your personal information, subject to
                  certain exceptions. Please note that we may be required to
                  retain certain information to comply with legal and regulatory
                  obligations (such as KYC/AML record-keeping requirements) even
                  after you request deletion or close your account.
                </li>
                <li>
                  <strong>Right to Data Portability:</strong> You have the right
                  to receive your personal information in a structured, commonly
                  used, and machine-readable format, and to transmit that data
                  to another controller.
                </li>
                <li>
                  <strong>Right to Object:</strong> You have the right to object
                  to the processing of your personal information for certain
                  purposes, including direct marketing.
                </li>
                <li>
                  <strong>Right to Restriction:</strong> You have the right to
                  request that we restrict the processing of your personal
                  information under certain circumstances, such as when you
                  contest the accuracy of your data or object to our processing.
                </li>
              </ul>
              <p>
                To exercise any of these rights, please contact us at{' '}
                <a
                  href="mailto:privacy@fueki-tech.com"
                  className="text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150 underline underline-offset-2"
                >
                  privacy@fueki-tech.com
                </a>
                . We will respond to your request within the timeframe required
                by applicable law.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 10. Cookies & Tracking                                          */}
            {/* -------------------------------------------------------------- */}
            <Section number="10" title="Cookies and Tracking Technologies">
              <p>
                Our Platform uses the following technologies to maintain session
                state and improve your experience:
              </p>
              <ul>
                <li>
                  <strong>localStorage:</strong> We use browser localStorage to
                  persist your authentication session, user preferences, and
                  application state across page reloads. This data is stored
                  locally on your device and is not transmitted to third parties.
                </li>
                <li>
                  <strong>Essential Cookies:</strong> We may use strictly
                  necessary cookies to ensure the proper functioning of our
                  Services, including security features and session management.
                </li>
              </ul>
              <p>
                We do not use third-party tracking cookies, advertising cookies,
                or social media tracking pixels. We do not participate in
                cross-site tracking or behavioral advertising networks.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 11. Data Retention                                              */}
            {/* -------------------------------------------------------------- */}
            <Section number="11" title="Data Retention">
              <p>
                We retain personal information in accordance with the following
                guidelines:
              </p>
              <ul>
                <li>
                  <strong>KYC/AML Records:</strong> Identity verification
                  documents, KYC data, and AML screening results are retained
                  for the duration of your account relationship and for a minimum
                  of five (5) years following the termination of that
                  relationship, or longer if required by applicable law or
                  regulation.
                </li>
                <li>
                  <strong>Transaction Records:</strong> Records of transactions
                  executed through the Platform are retained for as long as
                  required by applicable securities regulations and tax laws.
                  Note that transactions recorded on the blockchain are permanent
                  and cannot be deleted by Fueki.
                </li>
                <li>
                  <strong>Account Data:</strong> General account information is
                  retained for the duration of your account. Upon account
                  closure, non-regulated account data is deleted or anonymized
                  within a reasonable period, subject to any applicable legal
                  retention requirements.
                </li>
                <li>
                  <strong>Technical and Usage Data:</strong> Anonymized or
                  aggregated technical and usage data may be retained
                  indefinitely for analytics and platform improvement purposes.
                </li>
              </ul>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 12. Children's Privacy                                          */}
            {/* -------------------------------------------------------------- */}
            <Section number="12" title="Children's Privacy">
              <p>
                Our Services are not directed at, and are not intended for use
                by, persons under the age of eighteen (18). We do not knowingly
                collect personal information from individuals under 18 years of
                age. The creation of security tokens and participation in digital
                asset transactions requires users to be of legal age in their
                jurisdiction.
              </p>
              <p>
                If we become aware that we have collected personal information
                from an individual under the age of 18, we will take steps to
                delete such information promptly. If you believe that we may have
                inadvertently collected information from a minor, please contact
                us immediately at{' '}
                <a
                  href="mailto:privacy@fueki-tech.com"
                  className="text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150 underline underline-offset-2"
                >
                  privacy@fueki-tech.com
                </a>
                .
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 13. Changes to This Policy                                      */}
            {/* -------------------------------------------------------------- */}
            <Section number="13" title="Changes to This Policy">
              <p>
                We reserve the right to update or modify this Privacy Policy at
                any time. When we make material changes, we will notify you by
                posting the updated policy on our Platform with a revised
                &quot;Last updated&quot; date, and, where appropriate, by sending
                you a notification via email or through the Platform.
              </p>
              <p>
                We encourage you to review this Privacy Policy periodically to
                stay informed about our data practices. Your continued use of our
                Services after any changes to this Privacy Policy constitutes
                your acceptance of the updated policy.
              </p>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* 14. Contact Information                                         */}
            {/* -------------------------------------------------------------- */}
            <Section number="14" title="Contact Information">
              <p>
                If you have any questions, concerns, or requests regarding this
                Privacy Policy or our data practices, please contact us at:
              </p>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 sm:p-6 space-y-3">
                <p className="font-semibold text-[var(--text-primary)]">
                  Fueki Technologies, Inc.
                </p>
                <div className="space-y-1.5">
                  <p>
                    <span className="text-[var(--text-muted)]">Privacy Inquiries:</span>{' '}
                    <a
                      href="mailto:privacy@fueki-tech.com"
                      className="text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150 underline underline-offset-2"
                    >
                      privacy@fueki-tech.com
                    </a>
                  </p>
                  <p>
                    <span className="text-[var(--text-muted)]">General Support:</span>{' '}
                    <a
                      href="mailto:support@fueki-tech.com"
                      className="text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150 underline underline-offset-2"
                    >
                      support@fueki-tech.com
                    </a>
                  </p>
                </div>
              </div>
              <p>
                We will endeavor to respond to all inquiries within thirty (30)
                days of receipt.
              </p>
            </Section>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Fueki Technologies, Inc. All
            rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section -- Reusable privacy policy section wrapper
// ---------------------------------------------------------------------------

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] mb-4">
        {number}. {title}
      </h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-[var(--text-secondary)] [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_li]:text-[var(--text-secondary)] [&_strong]:text-[var(--text-primary)] [&_strong]:font-medium">
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// SubSection -- Nested heading within a Section
// ---------------------------------------------------------------------------

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
