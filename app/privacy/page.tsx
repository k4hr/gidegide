export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="shell">
        <section className="card">
          <h1>Privacy Policy</h1>

          <p>
            Lana Content Factory collects only the information needed to operate
            the service, such as connected account tokens, uploaded files,
            generated video files, job status, and publishing results.
          </p>

          <p>
            Connected account tokens are used only to publish content to accounts
            that the user has authorized through official platform authorization
            flows.
          </p>

          <p>
            Uploaded and generated video files may be stored temporarily for
            processing, publishing, debugging, and user access. Temporary files
            may be deleted automatically after a limited retention period.
          </p>

          <p>
            We do not sell user data to advertisers. We do not share connected
            account credentials with third parties except when required to
            communicate with the connected platform APIs.
          </p>

          <p>
            Users may request deletion of their connected account data and stored
            files by contacting the service owner.
          </p>
        </section>
      </div>
    </main>
  );
}
