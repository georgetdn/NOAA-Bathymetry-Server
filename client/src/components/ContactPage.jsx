import React from "react";
import PageLayout from "./PageLayout";

const ContactPage = () => {
    return (
        <PageLayout>
            <div className="contact-content">
                <h2>Contact Us</h2>

                {/* Contact Details - Wrapped inside a div for proper styling */}
                <div className="contact-info">
                    <p className="contact-line">
                        Call us at <strong><a href="tel:7035687739" className="phone-link">703-568-7739</a></strong>
                    </p>
                    <p className="contact-line">
                        Email us at <a href="mailto:info@y219.com" className="email-link">info@y219.com</a>
                    </p>
                    <p className="contact-line">Or fill out the form below.</p>
                </div>

                {/* Contact Form */}
                <form>
                    <div className="form-group">
                        <label htmlFor="name">Name:</label>
                        <input id="name" type="text" placeholder="Enter your name" required />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email:</label>
                        <input id="email" type="email" placeholder="Enter your email" required />
                    </div>

                    <div className="form-group">
                        <label htmlFor="message">Message:</label>
                        <textarea id="message" className="message-box" placeholder="Enter your message" rows="4" required></textarea>
                    </div>

                    <button type="submit">Send Message</button>
                </form>
            </div>
        </PageLayout>
    );
};

export default ContactPage;
