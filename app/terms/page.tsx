import Link from "next/link";

const updatedAt = "May 1, 2026";

export default function TermsPage() {
  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/factory/accounts">Open App</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>

        <section className="card legal-document">
          <h1>Terms of Service</h1>

          <p className="muted">Last updated: {updatedAt}</p>

          <h2>1. Overview</h2>
          <p>
            Lana Content Factory is a web application that helps users prepare,
            edit, render, and publish short-form gaming videos using reaction
            overlay templates. The service allows users to connect their own
            social media accounts, create video jobs, and send generated videos
            to connected publishing destinations.
          </p>

          <h2>2. Acceptance of these Terms</h2>
          <p>
            By using Lana Content Factory, you agree to these Terms of Service.
            If you do not agree with these terms, you must not use the service.
          </p>

          <h2>3. User accounts and platform connections</h2>
          <p>
            Users may connect third-party accounts, including TikTok and
            YouTube, through official authorization flows. The service uses
            platform access only after the user grants permission. Users may
            disconnect or delete connected accounts from the application.
          </p>

          <h2>4. User content</h2>
          <p>
            Users are solely responsible for all videos, images, audio,
            templates, titles, descriptions, hashtags, and other content that
            they upload, process, generate, or publish through the service.
          </p>

          <p>
            You must only upload and publish content that you own, have created,
            or have all necessary rights, licenses, consents, and permissions to
            use. You must not upload, process, or publish content that infringes
            copyrights, trademarks, publicity rights, privacy rights, or any
            other third-party rights.
          </p>

          <h2>5. Prohibited uses</h2>
          <p>You agree not to use the service to:</p>

          <ul>
            <li>Upload or publish content that you do not have rights to use.</li>
            <li>Violate the terms or policies of TikTok, YouTube, or any other platform.</li>
            <li>Post illegal, harmful, abusive, hateful, misleading, or deceptive content.</li>
            <li>Impersonate another person, brand, creator, or organization.</li>
            <li>Attempt to bypass platform review, safety, rate limit, or anti-abuse systems.</li>
            <li>Use the service for spam, mass abuse, or unauthorized automation.</li>
            <li>Reverse engineer, disrupt, or attack the service infrastructure.</li>
          </ul>

          <h2>6. TikTok and YouTube integrations</h2>
          <p>
            Lana Content Factory may integrate with TikTok Login Kit, TikTok
            Content Posting API, Google OAuth, and YouTube Data API. These
            integrations are used only after the user authorizes access through
            the relevant platform authorization flow.
          </p>

          <p>
            TikTok uploads may be sent as drafts or inbox upload flows,
            depending on the permissions available to the application and the
            user account. Users are responsible for reviewing and confirming
            any video before final publication when required by the platform.
          </p>

          <h2>7. No guarantee of publication, reach, or monetization</h2>
          <p>
            The service does not guarantee that a video will be accepted,
            published, recommended, monetized, or receive any views, likes,
            comments, subscribers, followers, revenue, or other results on
            third-party platforms.
          </p>

          <h2>8. Platform rules</h2>
          <p>
            Users remain responsible for complying with all applicable platform
            rules, including TikTok Terms of Service, TikTok Community
            Guidelines, YouTube Terms of Service, YouTube Community Guidelines,
            copyright policies, music policies, advertising policies, and any
            other applicable third-party policies.
          </p>

          <h2>9. Storage and processing</h2>
          <p>
            The service may temporarily store uploaded files, rendered videos,
            templates, account connection records, publishing status, job logs,
            and related metadata for the purpose of operating the application.
            Temporary video files may be removed automatically after processing
            or after a limited retention period.
          </p>

          <h2>10. Account deletion and disconnection</h2>
          <p>
            Users may delete connected accounts inside the application. Deleting
            a connected account removes the stored platform connection from
            Lana Content Factory and prevents future publishing actions through
            that account.
          </p>

          <h2>11. Service availability</h2>
          <p>
            The service is provided on an “as is” and “as available” basis. We
            may modify, suspend, limit, or discontinue any part of the service
            at any time. We are not responsible for downtime, third-party API
            changes, platform restrictions, upload failures, processing errors,
            or external service interruptions.
          </p>

          <h2>12. User responsibility for published content</h2>
          <p>
            If a user publishes content through a connected account, the user is
            responsible for that publication and for any consequences resulting
            from it. Lana Content Factory is a tool provider and does not
            assume ownership of user content.
          </p>

          <h2>13. Intellectual property</h2>
          <p>
            Users retain ownership of content they upload, subject to the rights
            needed for the service to process, render, store, and transmit the
            content as requested by the user. Lana Content Factory retains all
            rights to its software, interface, workflows, branding, and
            application infrastructure.
          </p>

          <h2>14. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Lana Content Factory is not
            liable for indirect, incidental, special, consequential, exemplary,
            or punitive damages, including lost profits, lost data, loss of
            account access, content removal, platform penalties, or lost
            business opportunities.
          </p>

          <h2>15. Changes to these Terms</h2>
          <p>
            We may update these Terms of Service from time to time. Continued
            use of the service after changes are posted means that you accept
            the updated terms.
          </p>

          <h2>16. Contact</h2>
          <p>
            For questions about these Terms, contact the service owner through
            the contact information provided in the application or developer
            account associated with this website.
          </p>
        </section>
      </div>
    </main>
  );
}
