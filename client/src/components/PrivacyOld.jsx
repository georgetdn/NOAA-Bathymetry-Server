import React from "react";
import PageLayout from "./PageLayout";

const PrivacyPage = () => {
    return (
        <PageLayout>
            <div className="terms-container">
                <h1>Privacy & Cookies Policy</h1>
                <p className="effective-date">Effective Date: 05/01/2021</p>

                <h2>1. Information We Collect</h2>
                <p>Y219.com collects information you provide directly to us, such as when you contact us for services, create an account, or communicate with us. This may include:</p>
                <ul>
                    <li>Personal identification information (name, email address, phone number)</li>
                    <li>Business information (company name, address, industry)</li>
                    <li>Technical information about your systems when providing IT services</li>
                    <li>Communication records and service history</li>
                </ul>

                <h2>2. How We Use Your Information</h2>
                <p>We use the information we collect to:</p>
                <ul>
                    <li>Provide, maintain, and improve our IT services</li>
                    <li>Process transactions and send related information</li>
                    <li>Send technical notices, updates, and support messages</li>
                    <li>Respond to your comments, questions, and customer service requests</li>
                    <li>Monitor and analyze trends and usage patterns</li>
                </ul>

                <h2>3. Information Sharing and Disclosure</h2>
                <p>We do not sell, trade, or otherwise transfer your personal information to third parties except in the following circumstances:</p>
                <ul>
                    <li>With your explicit consent</li>
                    <li>To trusted service providers who assist in operating our business</li>
                    <li>When required by law or to protect our rights and safety</li>
                    <li>In connection with a business transfer or acquisition</li>
                </ul>

                <h2>4. Data Security</h2>
                <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet or electronic storage is 100% secure.</p>

                <h2>5. Data Retention</h2>
                <p>We retain your personal information for as long as necessary to fulfill the purposes outlined in this policy, unless a longer retention period is required or permitted by law.</p>

                <h2>6. Cookies and Tracking Technologies</h2>
                <p>Our website uses cookies and similar tracking technologies to enhance your browsing experience. Cookies are small data files stored on your device.</p>

                <h2>7. Types of Cookies We Use</h2>
                <ul>
                    <li><strong>Essential Cookies:</strong> Necessary for the website to function properly</li>
                    <li><strong>Analytics Cookies:</strong> Help us understand how visitors interact with our website</li>
                    <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
                </ul>

                <h2>8. Cookie Management</h2>
                <p>You can control cookies through your browser settings. However, disabling certain cookies may affect website functionality. Most browsers allow you to:</p>
                <ul>
                    <li>View what cookies are stored and delete them individually</li>
                    <li>Block third-party cookies</li>
                    <li>Block cookies from specific sites</li>
                    <li>Delete all cookies when you close your browser</li>
                </ul>

                <h2>9. Your Rights</h2>
                <p>Depending on your location, you may have certain rights regarding your personal information:</p>
                <ul>
                    <li>Access to your personal information</li>
                    <li>Correction of inaccurate information</li>
                    <li>Deletion of your personal information</li>
                    <li>Restriction of processing</li>
                    <li>Data portability</li>
                    <li>Objection to processing</li>
                </ul>

                <h2>10. Third-Party Links</h2>
                <p>Our website may contain links to third-party websites. We are not responsible for the privacy practices or content of these external sites. We encourage you to review their privacy policies.</p>

                <h2>11. Children's Privacy</h2>
                <p>Our services are not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.</p>

                <h2>12. International Data Transfers</h2>
                <p>If you are located outside of [Your Country], please be aware that information we collect may be transferred to and processed in [Your Country]. By using our services, you consent to this transfer.</p>

                <h2>13. Changes to This Policy</h2>
                <p>We may update this Privacy & Cookies Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Effective Date."</p>

                <div className="terms-contact-info">
                    <h2>Contact Information</h2>
                    <p>If you have any questions about this Privacy & Cookies Policy, please contact us:</p>
                    <p><strong>Y219.com</strong><br/>
                    Email: contact@219.com<br/>
                    Phone: 703-568-7739<br/></p>
                </div>

                <div className="back-link">
                    <a href="/">← Back to Home</a>
                </div>
            </div>
        </PageLayout>
    );
};

export default PrivacyPage;