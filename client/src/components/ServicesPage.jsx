import React from "react";
import PageLayout from "./PageLayout";

const ServicesPage = () => {
    return (
        <PageLayout>
            <h2>Our Services</h2>
            <p>We provide high-quality IT solutions tailored to your needs. Below is a list of the services we offer:</p>

            <ul className="services-list">
                <li><strong>Home Network & WiFi Setup:</strong> Configure, optimize, and secure your home network.</li>
                <li><strong>Software Setup & Help:</strong> Install, configure, and troubleshoot software for personal and business use.</li>
                <li><strong>Small Business Automation:</strong> Streamline workflows and automate repetitive tasks for efficiency.</li>
                <li><strong>Accounting Software Assistance:</strong> Setup and training for QuickBooks, Xero, and other accounting tools.</li>
                <li><strong>Disaster Recovery & Backups:</strong> Implement backup solutions and disaster recovery plans to protect your data.</li>
                <li><strong>Help Desk Support:</strong> On-demand IT support for troubleshooting and resolving technical issues.</li>
                <li><strong>Custom Programming & Software Development:</strong> Build tailored software solutions to fit your specific needs.</li>
                <li><strong>Website Design & Development:</strong> Design and develop modern, responsive, and user-friendly websites.</li>
                <li><strong>Training & Consulting:</strong> One-on-one or group training sessions on various IT topics.</li>
            </ul>
        </PageLayout>
    );
};

export default ServicesPage;
