import React from "react";
import PageLayout from "./PageLayout";

const ServicesPage = () => {
    return (
        <PageLayout>
            <br/>
            <h1>FOR A LIMITED TIME ONLY!<sup><b>*</b></sup></h1>
             For a samle of an accounting firm website ($300.00) go <a href="https://y219.xyz/site1">here</a>

             <br/>
            <ul className="services-list">
                <li><strong>Free Estimate</strong> </li>
                <li>💻<strong>Web Development</strong> </li>
                <li><strong>Hosting by Y219.com at Hostinger.com</strong> Free</li>
                <li><strong>Basic site (1–5 pages) </strong> $150 - $300 (Static or WordPress, minimal customization)</li>
                <li><strong>Blog site (1–5 pages) </strong> $250 - $500 (WordPress)</li>
                <li><strong>Small business site</strong> $800 - 1500 (Includes services, contact forms, light CMS) </li>
                <li><strong>Custom design & features</strong>  $2,000 - $8,000 (Custom UI, dynamic content, integrations)</li>
                <li><strong>E-commerce site </strong> $2,000 - $10,000 Depends on product count, payment systems</li>
                <li><strong>Web app or SaaS platform </strong> $4,000 - $20,000 (Complex logic, backend systems, APIs)</li>
                <li>📦<strong>Additional Services (offered by a third party)</strong></li>

                <li><strong>Domain registration</strong> $10 – $20/year</li>
                <li><strong>Hosting (shared/VPS)</strong> $10 – $100/month</li>
                <li><strong>SEO setup</strong> $300 – $2,000</li>
                <li>🔧<strong>Ongoing maintenance(if needed)</strong> $25 – $60/hour</li>
                <li><br/><sup><b>*</b></sup>After 50% discount.</li>
            </ul>
           
        </PageLayout>
    );
};

export default ServicesPage;
