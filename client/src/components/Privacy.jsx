import React from "react";
import PageLayout from "./PageLayout";

const PrivacyPage = () => {
  return (
    <PageLayout>
      <div className="terms-container">
        <h1>Privacy Policy – Anchor Alarm 219 </h1>
		<h1>by George Dobrescu</h1>
        <p className="effective-date">
          <strong>Last updated:</strong> 2025-10-02
        </p>

        <section>
          <p>
            This Privacy Policy describes how <strong>George Dobrescu</strong> (“we”, “us”, or “our”)
            handles information in the mobile application <strong>Anchor Alarm 219</strong> (the “App”).
            The App helps you monitor your vessel’s position while at anchor. We designed it to work
            <strong> without collecting or selling your personal data</strong>. Location processing and alert
            logic occur on your device.
          </p>
        </section>

        <section>
          <h2>Information We Process</h2>
          <ul>
            <li>
              <strong>Location (required):</strong> Used to monitor GPS position and determine when to alert.
              Processed on-device in real time; not sent to our servers.
            </li>
            <li>
              <strong>Phone number (optional):</strong> If you enable SMS alerts, you enter a recipient number.
              It is stored locally on your device and used only to send alerts you configure.
            </li>
            <li>
              <strong>SMS (optional):</strong> If enabled, the App sends text messages from your device when
              conditions you set are met. Your mobile carrier processes these messages.
            </li>
            <li>
              <strong>Phone/SIM status (optional):</strong> Read only to confirm that a SIM card is available
              for sending SMS. The App does not make or receive phone calls.
            </li>
            <li>
              <strong>Crash/diagnostic data (optional):</strong> If you opt in via your OS or store settings,
              your device may send anonymized crash logs to the platform provider. We do not receive personally
              identifying information by default.
            </li>
          </ul>
        </section>

        <section>
          <h2>What We Don’t Do</h2>
          <ul>
            <li>We do <strong>not</strong> collect, store, or transmit your location to our servers.</li>
            <li>We do <strong>not</strong> use third-party analytics or advertising SDKs.</li>
            <li>We do <strong>not</strong> sell or share personal data.</li>
          </ul>
        </section>

        <section>
          <h2>How We Use Data</h2>
          <ul>
            <li>
              <strong>On-device monitoring:</strong> Location is used to compute movement and thresholds and to
              display maps and alerts.
            </li>
            <li>
              <strong>SMS alerts (optional):</strong> Your configured phone number is used only to send alerts you
              requested.
            </li>
            <li>
              <strong>Permissions used:</strong>
              <ul>
                <li>Location — anchor monitoring.</li>
                <li>SMS (send) — optional, to send alerts.</li>
                <li>Phone state — optional, to check SIM presence.</li>
                <li>Notifications — to show ongoing monitoring and alarms.</li>
                <li>Foreground service (location) — to keep monitoring active when the screen is off.</li>
              </ul>
            </li>
          </ul>
        </section>

        <section>
          <h2>Third-Party Services</h2>
          <p>
            The App may use Google services (e.g., Google Maps / Google Play Services). Map tiles, GNSS libraries,
            or crash services are provided by Google and subject to their privacy terms. Your device may contact
            Google servers to fetch maps/SDK updates or submit crash logs.
          </p>
          <p>
            When SMS alerts are enabled, messages are handled by your mobile carrier under their terms.
          </p>
        </section>

        <section>
          <h2>Data Storage &amp; Retention</h2>
          <p>
            Settings (such as phone number and thresholds) are stored locally on your device and remain until you
            delete the App or clear its data. SMS content is not stored by the App after sending (your SMS app or
            carrier may retain copies). We do not maintain server copies.
          </p>
        </section>

        <section>
          <h2>Your Choices</h2>
          <ul>
            <li>You can disable SMS alerts or remove the phone number in Settings.</li>
            <li>You can turn off location permission in system settings (note: the App won’t function without it).</li>
            <li>You can delete all local data by uninstalling the App or clearing its data in system settings.</li>
          </ul>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            We minimize data collection and keep processing on-device. No mobile app can guarantee perfect security;
            use strong device security (PIN/biometrics) and keep your OS up to date.
          </p>
        </section>

        <section>
          <h2>Children’s Privacy</h2>
          <p>
            The App is not directed to children under 13 (or the minimum age in your region). We do not knowingly
            collect personal data from children.
          </p>
        </section>

        <section>
          <h2>International Use</h2>
          <p>
            Data processing occurs on your device in the country where you use the App. We do not transfer your
            personal data to our servers.
          </p>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this policy to reflect App or legal changes. The updated version will be posted here with a
            new “Last updated” date.
          </p>
        </section>

        <section className="terms-contact-info">
          <h2>Contact</h2>
          <p>
            <strong>Y219.com</strong>
            <br />
            Email: <a href="mailto:contact@219.com">contact@219.com</a>
            <br />
            Phone: 703-568-7739
          </p>
        </section>

        <div className="back-link">
          <a href="/">← Back to Home</a>
        </div>
      </div>
    </PageLayout>
  );
};

export default PrivacyPage;
