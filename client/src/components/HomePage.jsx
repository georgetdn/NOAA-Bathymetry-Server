import React from "react";
import MenuBar from "./MenuBar";
import ImageCarousel from "./ImageCarousel";
import "../styles/HomePage.css";  // Import the override styles

const HomePage = () => {
    return (
        <div className="home-container">
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span><br/>
                <span className="small">Quality, Affordable IT Services</span>
            </div>
            <MenuBar />
            
            {/* Main Content */}
            <div className="content">
                <div className="carousel-wrapper">
                    <ImageCarousel />
                </div>
            </div>  

            {/* New Two Columns Section */}
            <div className="two-columns">
                <div className="column image-column">
                    <img src="images/About.jpg" alt="Description" className="column-image" />
                </div>
                <div className="column text-column">
                    <h2>About Y219.com</h2>
                    <p><br/>We provide high-quality, affordable IT services for businesses and individuals. 
From network setup and cybersecurity to software development, we deliver solutions tailored to your needs.
<br/><br/>
We specialize in cloud migration, data backup and recovery, and custom web applications.
Our services are designed to scale as your business grows.
Experience personalized support and innovative solutions with Y219.com.</p>
                </div>
                </div>
                <div className="two-columns">
                <div className="column text-column">
        <h2>Our Service Area</h2>
        <p><br/>
        Y219.com proudly provides IT services to businesses and individuals across Northern Virginia.
        We serve Alexandria, Fairfax, Arlington, and Prince William County with fast, reliable solutions.
        <br/><br/>
        Whether you need network setup, cybersecurity consulting, or custom software, we are ready to help.
        <br/><br/>
        Call us today at <strong>703-568-7739</strong> or email us at <strong>info@y219.com</strong> to learn more or schedule a consultation.
        </p>
    </div>
                
                
                    <div className="column image-column">
                        <img src="images/area.jpg" alt="Description" className="column-image" />
                    </div>            


            </div>

            {/* Footer */}
            <footer className="copyright">
                © {new Date().getFullYear()} Y219.com. All Rights Reserved.
            </footer>
        </div>
    );
};

export default HomePage;
