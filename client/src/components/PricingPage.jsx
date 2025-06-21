
import React, { useState } from "react";
import PageLayout from "./PageLayout";

const PricingPage = () => {
    return (
        <PageLayout>
            <p><h1>Pricing</h1></p>
            <div className="services-list">
                <p>
            <strong>Initial Consultation </strong>  -  Free <br/>    
             <strong>Customer Support Fee </strong> -  $35/hour <br/>    
             <strong>Linux and LibreOffice Installation</strong> -  Free <br/>    
             <strong>Odoo Accounting Unlimited Use</strong> -  Free <br/>   
             <strong>GNUcash Accounting Installation</strong> - Free<br/> 
             <strong>Telephone or Zoom Help Desk</strong>  - $25/hour <br/>   
             <strong>Custom Programming </strong> -  Based on project length (about $125/day) <br/>    
             <strong>Websites</strong><br/>
             <a href="https://y219.com/prom">Check prices here</a><br/>
             <strong>Odoo</strong><br/>
             <a href="https://www.odoo.com/pricing/">Check prices here</a><br/>
             <strong>QuickBooks</strong><br/>
             <a href="https://quickbooks.intuit.com/pricing/">Check prices here</a><br/>
             <strong>Quicken</strong><br/>
             <a href="https://www.quicken.com/products/pricing-comparison/#pricing">Check prices here</a><br/>
             <strong>For  Point of Sale hardware advice  <a href="../pos">click here</a></strong><br/>
             <strong>For  Credit Card and payments advice <a href="../payments">click here</a></strong>
           </p>
            </div>
            
        </PageLayout>
    );
};

export default PricingPage;
