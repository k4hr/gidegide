import Link from "next/link";

const updatedAt = "May 1, 2026";

export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/factory/accounts">Open App</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>

        <section className="card legal-document">
          <h1>Privacy Policy</h1>

          <p className="muted">Last updated: {updatedAt}</p>

          <h2>1. Overview</h2>
          <p>
            Lana Content Factory is a web application that helps users prepare,
            render, and publish short-form gaming videos with reaction overlay
            templates. This Privacy Policy explains what information is
            collected, how it is used, and how users can control their data.
          </p>

          <h2>2. Information we collect</h2>
          <p>
            We collect only the information needed to operate the service. This
            may include:
          </p>

          <ul>
            <li>Connected account information, such as platform name and display name.</li>
            <li>OAuth access tokens, refresh tokens, and token expiration times.</li>
            <li>Uploaded character videos, source videos, and rendered output videos.</li>
            <li>Template settings, including overlay position, size, and mirror settings.</li>
            <li>Publishing job data, including status, errors, platform post IDs, and URLs.</li>
            <li>Technical metadata such as file names, file sizes, MIME types, and storage keys.</li>
          </ul>

          <h2>3. TikTok data</h2>
          <p>
            When a user connects TikTok, Lana Content Factory uses TikTok Login
            Kit to request authorization from the user. The application may use
            TikTok account information to identify and display the connected
            account inside the dashboard.
          </p>

          <p>
            If the user selects TikTok as a publishing destination, the service
            may use TikTok Content Posting API to upload the generated video to
            the user’s connected TikTok account as a draft or inbox upload flow,
            depending on the permissions available.
          </p>

          <h2>4. YouTube data</h2>
          <p>
            When a user connects YouTube, Lana Content Factory uses Google OAuth
            and YouTube Data API to obtain authorization from the user. The
            service may use the authorized connection to upload videos to the
            selected YouTube channel when the user creates a publishing job.
          </p>

          <h2>5. How we use information</h2>
          <p>We use collected information to:</p>

          <ul>
            <li>Authenticate connected platform accounts.</li>
            <li>Show connected accounts inside the user dashboard.</li>
            <li>Process uploaded videos and render short-form output videos.</li>
            <li>Apply selected reaction overlay templates.</li>
            <li>Upload generated videos to user-selected publishing destinations.</li>
            <li>Display job progress, publishing results, and error messages.</li>
            <li>Maintain security, prevent abuse, and troubleshoot technical issues.</li>
          </ul>

          <h2>6. OAuth tokens</h2>
          <p>
            OAuth tokens are stored on the server and are used only to perform
            actions authorized by the user. Tokens are not sold, shared with
            advertisers, or used for unrelated purposes. Users can delete a
            connected account inside the application to remove the stored
            connection from Lana Content Factory.
          </p>

          <h2>7. Uploaded and generated videos</h2>
          <p>
            Uploaded and generated videos may be stored temporarily for
            rendering, publishing, user access, debugging, and operational
            purposes. The service may store files locally and/or in cloud object
            storage. Temporary files may be deleted automatically after a
            limited retention period or when no longer needed.
          </p>

          <h2>8. Sharing of information</h2>
          <p>
            We do not sell user data. We do not share connected account tokens
            with advertisers. We share information only when necessary to
            operate the service, such as sending authorized API requests to
            TikTok, YouTube, Google, storage providers, hosting providers, or
            other infrastructure services required to process and publish user
            content.
          </p>

          <h2>9. Third-party platforms</h2>
          <p>
            TikTok, YouTube, Google, Cloudflare, Railway, and other third-party
            services may process data according to their own privacy policies
            and terms. Users should review the privacy policies and terms of
            each platform they connect or use.
          </p>

          <h2>10. Data retention</h2>
          <p>
            We keep information only as long as needed to provide the service,
            comply with legal obligations, resolve disputes, prevent abuse, and
            maintain operational records. Users may delete connected accounts
            from the application. Video files may be removed manually or
            automatically according to the service retention settings.
          </p>

          <h2>11. User controls</h2>
          <p>Users may:</p>

          <ul>
            <li>Delete connected TikTok or YouTube accounts from the dashboard.</li>
            <li>Delete uploaded character videos from the application.</li>
            <li>Remove or change templates.</li>
            <li>Stop using the service at any time.</li>
            <li>Request deletion of stored data by contacting the service owner.</li>
          </ul>

          <h2>12. Security</h2>
          <p>
            We use reasonable technical and organizational measures to protect
            stored information. However, no internet service, hosting provider,
            API integration, or storage system can be guaranteed to be
            completely secure.
          </p>

          <h2>13. Children</h2>
          <p>
            Lana Content Factory is not intended for children. Users must be old
            enough to use TikTok, YouTube, and any connected third-party
            platform according to the applicable platform terms and local law.
          </p>

          <h2>14. International processing</h2>
          <p>
            Data may be processed and stored in countries other than the user’s
            country of residence, depending on the hosting, storage, and
            third-party API providers used by the service.
          </p>

          <h2>15. Changes to this Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Continued use
            of the service after changes are posted means that you accept the
            updated policy.
          </p>

          <h2>16. Contact</h2>
          <p>
            For privacy questions or deletion requests, contact the service
            owner through the contact information provided in the application or
            developer account associated with this website.
          </p>
        </section>
      </div>
    </main>
  );
}
