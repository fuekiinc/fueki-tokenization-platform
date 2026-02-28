// ---------------------------------------------------------------------------
// TermsContent -- Terms of Service prose (extracted for reuse in modal + page)
// ---------------------------------------------------------------------------

export default function TermsContent() {
  return (
    <div className="prose max-w-none space-y-10">
      <p className="text-[var(--text-secondary)] leading-relaxed">
        These Terms of Service (&quot;Terms&quot;) constitute a legally
        binding agreement between you (&quot;User,&quot; &quot;you,&quot;
        or &quot;your&quot;) and Fueki Technologies, Inc.
        (&quot;Fueki,&quot; &quot;we,&quot; &quot;us,&quot; or
        &quot;our&quot;), a Delaware corporation, governing your access to
        and use of the Fueki tokenization platform, including all
        associated websites, applications, smart contracts, APIs, and
        services (collectively, the &quot;Platform&quot;). Please read
        these Terms carefully before using the Platform.
      </p>

      {/* Section 1 -- Acceptance of Terms */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          1. Acceptance of Terms
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          By accessing, browsing, or using the Platform in any manner, you
          acknowledge that you have read, understood, and agree to be
          bound by these Terms, as well as our Privacy Policy, which is
          incorporated herein by reference. If you do not agree to these
          Terms, you must immediately cease all use of the Platform.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Your continued use of the Platform following any amendments or
          modifications to these Terms constitutes your acceptance of such
          changes. We reserve the right to deny access to the Platform to
          anyone, at any time, for any reason.
        </p>
      </section>

      {/* Section 2 -- Eligibility */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          2. Eligibility
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          To use the Platform, you must meet all of the following
          eligibility requirements:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            You must be at least eighteen (18) years of age, or the age of
            legal majority in your jurisdiction, whichever is greater.
          </li>
          <li>
            Where required by applicable law, you must qualify as an
            &quot;accredited investor&quot; as defined under Regulation D
            of the U.S. Securities Act of 1933, or meet equivalent
            qualifications under the laws of your jurisdiction.
          </li>
          <li>
            You must comply with all applicable local, state, national,
            and international laws and regulations, including but not
            limited to securities laws, anti-money laundering (AML) laws,
            and counter-terrorism financing (CTF) regulations.
          </li>
          <li>
            You are not a person or entity that is subject to economic
            sanctions, trade embargoes, or similar restrictions imposed by
            the United States (OFAC), the European Union, the United
            Nations, or any other applicable governmental authority.
          </li>
          <li>
            You are not located in, organized in, or a resident of any
            country or territory that is the subject of comprehensive
            country-wide or territory-wide sanctions.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3">
          By using the Platform, you represent and warrant that you meet
          all of the foregoing eligibility requirements. Fueki reserves
          the right to verify your eligibility at any time and may
          restrict or terminate your access if any of these requirements
          are not satisfied.
        </p>
      </section>

      {/* Section 3 -- Account Registration & KYC */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          3. Account Registration and KYC/AML Compliance
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          To access certain features of the Platform, you must create an
          account and complete our Know Your Customer (&quot;KYC&quot;)
          and Anti-Money Laundering (&quot;AML&quot;) verification
          process. In connection with registration, you agree to:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            Provide accurate, current, and complete information during the
            registration and verification process.
          </li>
          <li>
            Promptly update your account information to keep it accurate,
            current, and complete at all times.
          </li>
          <li>
            Submit valid government-issued identification documents,
            proof of address, and any other documentation reasonably
            requested by Fueki or its third-party verification partners.
          </li>
          <li>
            Maintain the security and confidentiality of your account
            credentials, including your password and any two-factor
            authentication codes.
          </li>
          <li>
            Immediately notify Fueki of any unauthorized access to or use
            of your account.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3">
          You are solely responsible for all activity that occurs under
          your account. Fueki shall not be liable for any loss or damage
          arising from your failure to maintain the security of your
          account credentials. We reserve the right to suspend or
          terminate accounts that fail KYC/AML verification or that we
          reasonably believe are associated with fraudulent or prohibited
          activity.
        </p>
      </section>

      {/* Section 4 -- Platform Services */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          4. Platform Services
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          The Platform provides institutional-grade digital asset
          tokenization services, including but not limited to:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            Creation and deployment of security tokens on the Ethereum
            blockchain.
          </li>
          <li>
            Management of token configurations, including compliance
            rules, transfer restrictions, and metadata.
          </li>
          <li>
            Facilitation of peer-to-peer transfers of security tokens
            between verified and authorized wallets.
          </li>
          <li>
            Access to exchange and trading functionalities for listed
            security tokens, subject to applicable regulations.
          </li>
          <li>
            Portfolio tracking, analytics, and reporting tools.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3 font-medium">
          THE PLATFORM DOES NOT PROVIDE INVESTMENT ADVICE, FINANCIAL
          ADVISORY SERVICES, BROKERAGE SERVICES, OR RECOMMENDATIONS OF
          ANY KIND. Nothing on the Platform constitutes a solicitation,
          recommendation, endorsement, or offer by Fueki to buy, sell, or
          hold any security token or other financial instrument. All
          investment decisions are made solely at the User&apos;s own risk
          and discretion. You should consult your own legal, tax, and
          financial advisors before making any investment decisions.
        </p>
      </section>

      {/* Section 5 -- Security Tokens */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          5. Security Tokens
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          Security tokens created, managed, or traded through the Platform
          are digital representations of ownership interests and may be
          subject to the following:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            <span className="font-medium text-[var(--text-primary)]">Fractional Ownership.</span>{' '}
            Security tokens may represent fractional ownership interests
            in underlying assets, including but not limited to equity,
            debt, real estate, or other financial instruments. The rights
            and obligations associated with each token are defined by the
            applicable offering documents and smart contract parameters.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Securities Regulations.</span>{' '}
            Security tokens are subject to applicable federal, state, and
            international securities laws and regulations. Issuers and
            holders must comply with all such laws, including registration
            requirements, exemptions, and ongoing reporting obligations.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Transfer Restrictions.</span>{' '}
            Security tokens may be subject to transfer restrictions,
            including but not limited to holding periods, jurisdictional
            limitations, accreditation requirements, and maximum holder
            counts. Smart contracts enforcing these restrictions are
            deployed on-chain and may not be overridden.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Lock-Up Periods.</span>{' '}
            Certain security tokens may be subject to mandatory lock-up
            periods during which transfers are prohibited. Lock-up periods
            are enforced programmatically and cannot be waived by Fueki.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3">
          Fueki does not guarantee the legality, validity, or
          enforceability of any security token in any particular
          jurisdiction. Users are solely responsible for ensuring
          compliance with all applicable laws in connection with the
          issuance, purchase, sale, or transfer of security tokens.
        </p>
      </section>

      {/* Section 6 -- Subscription & Fees */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          6. Subscription and Fees
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          Access to the Platform requires a paid subscription. The
          following subscription plans are currently offered:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            <span className="font-medium text-[var(--text-primary)]">Monthly Plan:</span>{' '}
            $200.00 USD per month, billed monthly.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Annual Plan:</span>{' '}
            $1,800.00 USD per year, billed annually (equivalent to
            $150.00 per month).
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Full Service Plan:</span>{' '}
            Bespoke pricing for white-glove tokenization support, where the Fueki
            team manages token configuration and deployment while you retain platform
            access to manage and monetize your token supply. Pricing is invoiced
            based on your specific requirements.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Smart Contract Deployment Monthly:</span>{' '}
            $50.00 USD per month for deployer-only access, plus a per-contract
            deployment fee.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Smart Contract Deployment Annual:</span>{' '}
            $600.00 USD per year for deployer-only access, plus a per-contract
            deployment fee.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">White Glove Smart Contract Deployment:</span>{' '}
            Bespoke pricing for white-glove deployment and configuration. Fueki
            will invoice an estimate based on your requirements.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3 mb-3">
          All fees are non-refundable except as expressly set forth herein
          or as required by applicable law. By subscribing, you authorize
          Fueki to charge your designated payment method on a recurring
          basis until you cancel your subscription.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          In addition to subscription fees, certain Platform activities
          may incur additional fees, including but not limited to token
          deployment gas fees, trading commissions, and network
          transaction costs. Such fees will be disclosed prior to the
          applicable transaction.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          For smart-contract-deployment-only subscriptions, platform access is
          restricted to the contract deployment and contract management workflows.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Fueki reserves the right to modify its pricing, introduce new
          fees, or change the structure of its subscription plans at any
          time upon thirty (30) days&apos; prior written notice to you. Your
          continued use of the Platform after the effective date of any
          pricing change constitutes your acceptance of the new pricing.
        </p>
      </section>

      {/* Section 7 -- Wallet Connection */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          7. Wallet Connection and Custody
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          The Platform enables you to connect your self-custodial
          cryptocurrency wallet (e.g., MetaMask, WalletConnect-compatible
          wallets) to interact with blockchain-based features. By
          connecting your wallet, you acknowledge and agree that:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            You are the sole owner and controller of your wallet and its
            associated private keys, seed phrases, and recovery
            mechanisms.
          </li>
          <li>
            Fueki is a non-custodial platform. We do not hold, store, or
            have access to your private keys, seed phrases, or digital
            assets at any time.
          </li>
          <li>
            You are solely responsible for the security of your wallet,
            private keys, and seed phrases. Loss of private keys or seed
            phrases may result in the permanent and irreversible loss of
            your digital assets.
          </li>
          <li>
            Fueki shall not be liable for any loss of digital assets
            resulting from unauthorized access to your wallet, loss of
            private keys, wallet software vulnerabilities, or any other
            wallet-related incidents.
          </li>
          <li>
            Blockchain transactions are irreversible once confirmed. Fueki
            cannot reverse, cancel, or modify any blockchain transaction.
          </li>
        </ul>
      </section>

      {/* Section 8 -- Risks & Disclaimers */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          8. Risks and Disclaimers
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          You acknowledge and accept that the use of the Platform and
          participation in digital asset transactions involve significant
          risks, including but not limited to:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            <span className="font-medium text-[var(--text-primary)]">Blockchain and Technology Risks.</span>{' '}
            Blockchain networks may experience downtime, congestion,
            forks, or protocol changes that may adversely affect the
            Platform or your digital assets.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Smart Contract Risks.</span>{' '}
            Smart contracts are experimental technology. Despite auditing
            and testing, smart contracts may contain undiscovered bugs,
            vulnerabilities, or defects that could result in the loss of
            digital assets or unintended behavior.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Market Volatility.</span>{' '}
            The value of digital assets and security tokens is highly
            volatile and may fluctuate significantly. You may lose some or
            all of the value of your digital assets.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Regulatory Uncertainty.</span>{' '}
            The regulatory landscape for digital assets, security tokens,
            and blockchain technology is evolving and uncertain. Changes
            in laws, regulations, or governmental policies may adversely
            affect the Platform, security tokens, or your ability to use
            the Platform.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Liquidity Risk.</span>{' '}
            Security tokens may have limited liquidity. You may not be
            able to sell or transfer your tokens at the desired price or
            at any price.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Counterparty Risk.</span>{' '}
            Transactions conducted through the Platform involve
            counterparty risk. Fueki does not guarantee the performance,
            solvency, or conduct of any User or third party.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-4 font-medium uppercase tracking-wide text-sm">
          THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS
          AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
          IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO WARRANTIES
          OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          NON-INFRINGEMENT, ACCURACY, OR AVAILABILITY. FUEKI DOES NOT
          WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE,
          SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. FUEKI
          MAKES NO GUARANTEES REGARDING THE RETURN ON ANY INVESTMENT OR
          THE PERFORMANCE OF ANY SECURITY TOKEN.
        </p>
      </section>

      {/* Section 9 -- Intellectual Property */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          9. Intellectual Property
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          The Platform, including all software, code, smart contracts,
          interfaces, designs, trademarks, logos, documentation, and
          content (collectively, &quot;Fueki IP&quot;), is the exclusive
          property of Fueki Technologies, Inc. and is protected by
          copyright, trademark, patent, trade secret, and other
          intellectual property laws. You are granted a limited,
          non-exclusive, non-transferable, revocable license to access and
          use the Platform solely in accordance with these Terms.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          You may not copy, modify, distribute, sell, lease, sublicense,
          reverse engineer, decompile, disassemble, or create derivative
          works of any Fueki IP without our prior written consent.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          You retain all rights, title, and interest in any data,
          documents, or information that you upload, submit, or otherwise
          provide to the Platform (&quot;User Content&quot;). By
          submitting User Content, you grant Fueki a non-exclusive,
          worldwide, royalty-free license to use, process, and store such
          content solely as necessary to provide and improve the Platform
          services.
        </p>
      </section>

      {/* Section 10 -- Limitation of Liability */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          10. Limitation of Liability
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3 font-medium uppercase tracking-wide text-sm">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
          SHALL FUEKI, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS,
          AFFILIATES, SUCCESSORS, OR ASSIGNS BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
          DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF
          PROFITS, GOODWILL, DATA, USE, OR OTHER INTANGIBLE LOSSES,
          ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO
          USE THE PLATFORM, REGARDLESS OF THE THEORY OF LIABILITY
          (CONTRACT, TORT, STRICT LIABILITY, OR OTHERWISE), EVEN IF FUEKI
          HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed font-medium uppercase tracking-wide text-sm">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, FUEKI&apos;S
          TOTAL AGGREGATE LIABILITY ARISING OUT OF OR IN CONNECTION WITH
          THESE TERMS OR YOUR USE OF THE PLATFORM SHALL NOT EXCEED THE
          TOTAL AMOUNT OF SUBSCRIPTION FEES ACTUALLY PAID BY YOU TO FUEKI
          DURING THE TWELVE (12) MONTH PERIOD IMMEDIATELY PRECEDING THE
          EVENT GIVING RISE TO THE CLAIM.
        </p>
      </section>

      {/* Section 11 -- Indemnification */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          11. Indemnification
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          You agree to indemnify, defend, and hold harmless Fueki
          Technologies, Inc. and its directors, officers, employees,
          agents, affiliates, successors, and assigns from and against
          any and all claims, damages, losses, liabilities, costs, and
          expenses (including reasonable attorneys&apos; fees and court
          costs) arising out of or related to: (a) your use of or access
          to the Platform; (b) your violation of these Terms or any
          applicable law or regulation; (c) your User Content; (d) your
          issuance, purchase, sale, or transfer of security tokens through
          the Platform; (e) any dispute between you and a third party
          arising from your use of the Platform; or (f) your negligence or
          willful misconduct. This indemnification obligation shall
          survive the termination of your account and these Terms.
        </p>
      </section>

      {/* Section 12 -- Prohibited Activities */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          12. Prohibited Activities
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          You agree not to engage in any of the following prohibited
          activities in connection with your use of the Platform:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            Market manipulation, including but not limited to wash
            trading, spoofing, layering, pump-and-dump schemes, or any
            other conduct designed to artificially influence the price or
            trading volume of any security token.
          </li>
          <li>
            Fraud, misrepresentation, or deceptive practices of any kind,
            including the provision of false or misleading information
            during registration, KYC verification, or token issuance.
          </li>
          <li>
            Money laundering, terrorist financing, sanctions evasion, or
            any activity that violates applicable AML/CTF laws and
            regulations.
          </li>
          <li>
            Circumventing or attempting to circumvent any access
            restrictions, transfer restrictions, security measures,
            compliance controls, or technical limitations implemented by
            the Platform or its smart contracts.
          </li>
          <li>
            Using the Platform to violate or facilitate the violation of
            any applicable securities laws or regulations.
          </li>
          <li>
            Interfering with or disrupting the Platform&apos;s
            infrastructure, servers, networks, or services, including
            through the use of bots, scrapers, denial-of-service attacks,
            or similar methods.
          </li>
          <li>
            Accessing or attempting to access another User&apos;s account
            or wallet without authorization.
          </li>
          <li>
            Using the Platform for any purpose that is unlawful,
            unethical, or contrary to the spirit of these Terms.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3">
          Fueki reserves the right to investigate and take appropriate
          action against any User suspected of engaging in prohibited
          activities, including but not limited to suspending or
          terminating accounts, freezing or restricting token transfers,
          and reporting suspected violations to law enforcement or
          regulatory authorities.
        </p>
      </section>

      {/* Section 13 -- Termination */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          13. Termination
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          Either party may terminate these Terms at any time, subject to
          the following:
        </p>
        <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] leading-relaxed ml-2">
          <li>
            <span className="font-medium text-[var(--text-primary)]">Termination by You.</span>{' '}
            You may terminate your account at any time by contacting
            support or using the account closure feature in your settings.
            Termination does not entitle you to a refund of any
            subscription fees already paid.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Termination by Fueki.</span>{' '}
            Fueki may suspend or terminate your account and access to the
            Platform at any time, with or without cause, and with or
            without notice, including but not limited to cases of
            suspected violation of these Terms, fraudulent activity, or
            regulatory requirements.
          </li>
          <li>
            <span className="font-medium text-[var(--text-primary)]">Effects on Tokens.</span>{' '}
            Upon termination, your ability to access the Platform and use
            its management and trading features will cease. However,
            security tokens held in your self-custodial wallet will remain
            on the Ethereum blockchain and subject to the rules encoded in
            their respective smart contracts. Fueki is not responsible for
            managing, transferring, or redeeming tokens following
            termination of your account.
          </li>
        </ul>
        <p className="text-[var(--text-secondary)] leading-relaxed mt-3">
          Sections 8 (Risks and Disclaimers), 9 (Intellectual Property),
          10 (Limitation of Liability), 11 (Indemnification), 14
          (Governing Law), and any other provisions that by their nature
          should survive termination, shall survive the termination of
          these Terms.
        </p>
      </section>

      {/* Section 14 -- Governing Law */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          14. Governing Law and Dispute Resolution
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          These Terms shall be governed by and construed in accordance
          with the laws of the State of Delaware, United States of
          America, without regard to its conflict of law principles.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          Any dispute, controversy, or claim arising out of or relating to
          these Terms, or the breach, termination, or invalidity thereof,
          shall be settled by binding arbitration administered by the
          American Arbitration Association (&quot;AAA&quot;) in accordance
          with its Commercial Arbitration Rules. The arbitration shall be
          conducted by a single arbitrator in Wilmington, Delaware. The
          language of the arbitration shall be English.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          The arbitrator&apos;s decision shall be final and binding upon
          the parties and may be entered as a judgment in any court of
          competent jurisdiction. Each party shall bear its own costs and
          expenses in connection with the arbitration, except that the
          prevailing party shall be entitled to recover its reasonable
          attorneys&apos; fees and costs from the non-prevailing party.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed font-medium uppercase tracking-wide text-sm">
          YOU AGREE THAT ANY ARBITRATION OR PROCEEDING SHALL BE LIMITED TO
          THE DISPUTE BETWEEN FUEKI AND YOU INDIVIDUALLY. TO THE FULLEST
          EXTENT PERMITTED BY LAW, (A) NO ARBITRATION OR PROCEEDING SHALL
          BE JOINED WITH ANY OTHER; (B) THERE IS NO RIGHT OR AUTHORITY
          FOR ANY DISPUTE TO BE ARBITRATED OR RESOLVED ON A CLASS-ACTION
          BASIS OR TO UTILIZE CLASS ACTION PROCEDURES; AND (C) THERE IS
          NO RIGHT OR AUTHORITY FOR ANY DISPUTE TO BE BROUGHT IN A
          PURPORTED REPRESENTATIVE CAPACITY ON BEHALF OF THE GENERAL
          PUBLIC OR ANY OTHER PERSONS.
        </p>
      </section>

      {/* Section 15 -- Changes to Terms */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          15. Changes to Terms
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          Fueki reserves the right to modify, amend, or update these Terms
          at any time in its sole discretion. When we make material
          changes to these Terms, we will provide notice through one or
          more of the following methods: (a) posting the updated Terms on
          the Platform with a revised &quot;Last updated&quot; date;
          (b) sending an email notification to the address associated with
          your account; or (c) displaying a prominent notice within the
          Platform.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Your continued use of the Platform after the effective date of
          any modified Terms constitutes your binding acceptance of such
          modifications. If you do not agree to the modified Terms, your
          sole remedy is to discontinue use of the Platform and terminate
          your account. It is your responsibility to review these Terms
          periodically for changes.
        </p>
      </section>

      {/* Section 16 -- Contact Information */}
      <section>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
          16. Contact Information
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
          If you have any questions, concerns, or requests regarding these
          Terms of Service, please contact us at:
        </p>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <p className="text-[var(--text-primary)] font-medium mb-1">
            Fueki Technologies, Inc.
          </p>
          <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
            Email:{' '}
            <a
              href="mailto:support@fueki-tech.com"
              className="text-[var(--accent-primary)] hover:text-[var(--accent-tertiary)] underline underline-offset-2 transition-colors duration-200"
            >
              support@fueki-tech.com
            </a>
          </p>
        </div>
      </section>

      {/* Closing */}
      <div className="border-t border-white/[0.06] pt-8 mt-12">
        <p className="text-[var(--text-muted)] text-sm leading-relaxed">
          By using the Fueki tokenization platform, you acknowledge that
          you have read, understood, and agree to be bound by these Terms
          of Service in their entirety.
        </p>
      </div>
    </div>
  );
}
