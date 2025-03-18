import React, { useState } from "react";
import PageLayout from "./PageLayout";

const PricingPage = () => {
    return (
        <PageLayout>
            <h2>Pricing</h2>
            <div className="contact-content">
            <strong>Initial Consulation </strong>  Free <br/>   <br/>
             <strong>Consulting Fee </strong>  $25/hour <br/>   <br/>
             <strong>Linux and LibreOffice Installation</strong>  Free <br/>   <br/>
             <strong>Telephone or Zoom Help Desk</strong>  $20/hour <br/>   <br/>
             <strong>Custom Programming </strong>  Based on project length (about $125/day) <br/>   <br/>
             <strong>Of the shelf software (to be purchased by the client): </strong> <br/>
             <strong>Odoo</strong><br/>
             <a href="https://www.odoo.com/pricing/">Check prices here</a><br/>
             <strong>QuickBooks</strong><br/>
             <a href="https://quickbooks.intuit.com/pricing/">Check prices here</a><br/>
             <strong>Quicken</strong><br/>
             <a href="https://www.quicken.com/products/pricing-comparison/#pricing">Check prices here</a><br/>
             <strong>GNUcash</strong><br/>
                Free

            </div>
            <p>
            <img src="/images/image11.jpg" alt="Odoo" />
</p>
        </PageLayout>
    );
};

export default PricingPage;
