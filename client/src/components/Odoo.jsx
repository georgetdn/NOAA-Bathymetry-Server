import React, { useState } from "react";
import PageLayout from "./PageLayout";
import "../styles/Odoo.css"; // Import the CSS file for styling

const Odoo = () => {
   return (
        <PageLayout>
            <h1>Odoo</h1>
 
                   <div className="services-list">
     We offer <strong>Odoo setup, advice, installation, and maintenance</strong> to help you streamline your business finances.  
    Need assistance? <a href="../contact">Contact us here</a>. <br/>
                            📌 <strong>What is Odoo?</strong><br/>
                        Odoo is an all-in-one business management software that helps companies manage various business operations, including CRM, sales, inventory, accounting, HR, manufacturing, and more. It is modular, meaning businesses can install and use only the apps they need.
                        <br/><br/>
                        💡 <strong>Why Choose Odoo?</strong><br/>
                        <br/>
                        ✔ All-in-One Platform – No need for separate software.<br/>
                        ✔ Cost-Effective – Open-source means lower costs.<br/>
                        ✔ Scalable – Start small and expand with more apps.<br/>
                        ✔ Customizable – Adapt to specific business needs.<br/>
                        <br/>
                        🎯 <strong>Who Uses Odoo?</strong><br/>
                        <br/>
                        ✔ Small & Medium Businesses (SMBs) → Cost-effective, scalable ERP.<br/>
                        ✔ E-commerce Stores → Manages sales, inventory, and invoices.<br/>
                        ✔ Manufacturers → Tracks production and supply chain.<br/>
                        ✔ Retail & Wholesale → POS system and inventory tracking.
                        <br/><br/>
                        🚀 <strong>Key Features of Odoo</strong><br/>
  1️⃣ Modular Design (Apps-Based)<br/>


    Odoo consists of individual apps that businesses can install as needed.<br/>
    Core modules include:<br/>
        CRM → Manage customer relationships.<br/>
        Sales & Invoicing → Handle quotations, orders, and invoices.<br/>
        Inventory & Manufacturing → Track stock and production.<br/>
        Accounting → Manage financials, taxes, and reports.<br/>
        HR & Payroll → Employee management and payroll processing.<br/>
        E-commerce & Website → Build an online store.<br/>
        <br/>
2️⃣ Customizable<br/>

    Odoo Enterprise Edition has additional premium features.<br/>
    Highly customizable via Python and XML.<br/>
    <br/>
3️⃣ Cloud & On-Premise Deployment<br/>

    Use Odoo online (SaaS) or self-hosted on your own server.<br/>
    Supports multi-user, multi-company, and multi-language.<br/>
    <br/>
4️⃣ Integrations & Automation<br/>
<br/>
    Connects with Stripe, PayPal, QuickBooks, Amazon, eBay, and more.<br/>
    Automates workflows with built-in tools like Odoo Studio.<br/>
    <br/>
5️⃣ AI-Powered Features (New in Odoo 17)<br/>

    AI-assisted email automation, sales predictions, and chatbots.<br/><br/>
    More information about Odoo at <a href="https://www.odoo.com/">www.odoo.com/</a>
                    </div>
        </PageLayout>
    );
};

export default Odoo;