import React from "react";
import MenuBar from "./MenuBar";
import ImageCarousel from "./ImageCarousel";
import "../styles/HomePage.css";  // Import the override styles

const HomePage = () => {
    return (
        <div className="home-container">
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span> <br/>
                <span className="small">Quality, Affordable IT Services</span>

            </div>
            <MenuBar />
            
            {/* Main Co</h1>ntent */}
            <div >
                <ImageCarousel />

                {/* Star image overlay */}
                <a href="/prom" className="star-link">
                <img
                src="images/star.png"
                alt="Star"
                className="star-overlay"
                />
                </a>
                <a href="/contact" className="star-link">
                <img
                src="images/contact.png"
                alt="Star"
                className="contact"
                />
                </a>


            </div>

            {/* New Two Columns Section */}
          
           <br/>
            <div className="two-columns">
                <div className="column image-column">
                    <img src="images/About.jpg" alt="Description" className="column-image" />
                </div>
                <div className="column text-column">
                    <h1>About Y219.com</h1>
                    <p>We provide high-quality, affordable IT services for businesses and individuals. 
From network setup and cybersecurity to software development, we deliver solutions tailored to your needs.
<br/>
We specialize in cloud migration, data backup and recovery, and custom web applications.
Our services are designed to scale as your business grows.
Experience personalized support and innovative solutions with Y219.com.</p>
                </div>
                </div>
                <div className="two-columns">
                <div className="column text-column">
        <h1>Our Service Area</h1>
        <p>
        Y219.com proudly provides IT services to businesses and individuals across Northern Virginia.
        We serve Alexandria, Fairfax, Arlington, and Prince William County with fast, reliable solutions.
        <br/>
        Whether you need network setup, cybersecurity consulting, or custom software, we are ready to help.
        <br/>
        Call us today at  <strong><a href="tel:7035687739">703-568-7739 </a></strong> or email us at <a href="mailto:info@y219.com">info@y219.com</a> to learn more or schedule a consultation.
        </p>

                     </div>
                
                
                    <div className="column image-column">
                        <img src="images/image12.jpg" alt="Description" className="column-image" />
                    </div>    

            </div>

            <h1 class="centered">Local Tech Support You Can Trust</h1>
            <div className="two-columns">
                <div className="column image-column">
                    <img src="images/image13.jpg" alt="Description" className="column-image" />
                </div>
                <div className="column text-column">
             <h1> Our services</h1>
			<p>	Free Estimate <br/>
				Home Computing Support<br/> 
				Accounting Software  <br/>
				IT Training & Education <br/>
				Network Security <br/>
				Website Development & Maintenance<br/> 
				Home & Office Networks<br/>
				Programming<br/> 
                Technical Support & Helpdesk Services <br/>
				Data Backup & Disaster Recovery<br/>
				Cloud Computing Solutions <br/>
            </p>
                </div>
                </div>
        <div className="centered"><h1>“Technology made simple — service made personal.”</h1><br/><br/><br/></div>
            {/* Footer */}
<footer className="copyright">
    <div className="footer-links">
        <a href="/terms">Terms Of Use</a>
        <span className="footer-separator">|</span>
        <a href="/privacy">Privacy & Cookies</a>
    </div>
    <div>
        © {new Date().getFullYear()} Y219.com. All Rights Reserved.
    </div>
</footer>
            <br/>
        </div>
        
    );
};

export default HomePage;
