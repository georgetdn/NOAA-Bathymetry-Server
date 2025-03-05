import React, { useState, useEffect } from "react";
import "../styles/ImageCarousel.css";

console.log("✅ ImageCarousel component loaded");

const images = [
    "/images/image1.jpg",
    "/images/image2.jpg",
    "/images/image3.jpg",
    "/images/image4.jpg",
    "/images/image5.jpg",
    "/images/image6.jpg",
    "/images/image7.jpg",
    "/images/image8.jpg",
    "/images/image9.jpg",
];

const textData = [
    {
        line1: "Welcome to Y219.com!",
        line2: "Quality, Affordable IT Services",
        line3: "Small business and home!",
    },
    {
        line1: "Custom IT Solutions",
        line2: "Tailored for Your Business",
        line3: "Grow your digital presence with us!",
    },
    {
        line1: "Secure & Reliable",
        line2: "Advanced Cybersecurity Services",
        line3: "Keep your data safe and protected",
    },
    {
        line1: "24/7 Support",
        line2: "Always Here to Help",
        line3: "Fast response and expert assistance",
    },
    {
        line1: "Scalable Solutions",
        line2: "Designed to Grow with You",
        line3: "Future-proof your business today!",
    },
    {
        line1: "Expert Consulting",
        line2: "Strategic IT Planning",
        line3: "Optimize your operations for success",
    },
    {
        line1: "Custom Software",
        line2: "Designed for Your Needs",
        line3: "Programming based on your specifications",
    },
    {
        line1: "Network Expretise",
        line2: "Design and Maintenance",
        line3: "Home or small business networks",
    },
    {
        line1: "Accountgin Software",
        line2: "Instalation and Setup",
        line3: "Custom extensions",
    }

];

const ImageCarousel = () => {
    console.log("✅ ImageCarousel function starts");

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentIndex === images.length) {
                setIsTransitioning(false);
                setCurrentIndex(0);
                setTimeout(() => setIsTransitioning(true), 50);
            } else {
                setCurrentIndex((prevIndex) => prevIndex + 1);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [currentIndex]);

    return (
        <div className="carousel-container">
            <div
                className="carousel-images"
                style={{
                    transform: `translateX(-${currentIndex * 100}vw)`,
                    transition: isTransitioning ? "transform 1s ease-in-out" : "none",
                }}
            >
                {images.map((image, index) => (
                    <div key={index} className="carousel-slide">
                        <img src={image} alt={`Slide ${index + 1}`} />
                        <div className="carousel-text-container">
                            <p className="carousel-text line1">{textData[index].line1}</p>
                            <p className="carousel-text line2">{textData[index].line2}</p>
                            <p className="carousel-text line3">{textData[index].line3}</p>
                        </div>
                    </div>
                ))}
                {/* Duplicate first image for smooth looping */}
                <div className="carousel-slide">
                    <img src={images[0]} alt="Duplicate first slide" />
                    <div className="carousel-text-container">
                        <p className="carousel-text line1">{textData[0].line1}</p>
                        <p className="carousel-text line2">{textData[0].line2}</p>
                        <p className="carousel-text line3">{textData[0].line3}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageCarousel;
