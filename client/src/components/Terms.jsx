import React from "react";
import PageLayout from "./PageLayout";

const TermsPage = () => {
    return (
        <PageLayout>
            <div className="terms-container">
                <h1>Terms of Use</h1>
                <p className="effective-date">Effective Date: 05/01/2021</p>

                <h2>1. Acceptance of Terms</h2>
                <p>By accessing and using the Y219.com website and services, you agree to be bound by these Terms of Use and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.</p>

                 <h2>2. Use License</h2>
        <p>Permission is granted to temporarily download one copy of the materials on Y219.com's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
        <ul >
            <li>modify or copy the materials</li>
            <li>use the materials for any commercial purpose or for any public display</li>
            <li>attempt to reverse engineer any software contained on the website</li>
            <li>remove any copyright or other proprietary notations from the materials</li>
        </ul>

        <h2>3. Services</h2>
        <p>Y219.com provides quality, affordable IT services including but not limited to technical support, system maintenance, and IT consulting. All services are provided subject to availability and our professional judgment.</p>

        <h2>4. User Responsibilities</h2>
        <p>Users of our services agree to:</p>
        <ul  >
            <li>provide accurate and complete information when requested</li>
            <li>maintain the confidentiality of any login credentials</li>
            <li>use our services only for lawful purposes</li>
            <li>not interfere with or disrupt our services or servers</li>
        </ul>

        <h2>5. Privacy</h2>
        <p>Your privacy is important to us. Please review our Privacy Policy, which also governs your use of our services, to understand our practices.</p>

        <h2>6. Disclaimer</h2>
        <p>The materials on Y219.com's website are provided on an 'as is' basis. Y219.com makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

        <h2>7. Limitations</h2>
        <p>In no event shall Y219.com or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Y219.com's website, even if Y219.com or an authorized representative has been notified orally or in writing of the possibility of such damage.</p>

        <h2>8. Service Modifications</h2>
        <p>Y219.com may revise these terms of use for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of use.</p>

        <h2>9. Governing Law</h2>
        <p>These terms and conditions are governed by and construed in accordance with the laws of The United States and you irrevocably submit to the exclusive jurisdiction of the courts in that state or location.</p>

        <h2>10. Payment Terms</h2>
        <p>All services are subject to our standard payment terms. Payment is due within 30 days of invoice date unless otherwise agreed upon in writing. Late payments may be subject to additional fees.</p>

        <h2>11. Termination</h2>
        <p>We reserve the right to terminate or suspend access to our services immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>

  



                <div className="terms-contact-info">
                    <h2>Contact Information</h2>
                    <p>If you have any questions about these Terms of Use, please contact us:</p>
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

export default TermsPage;