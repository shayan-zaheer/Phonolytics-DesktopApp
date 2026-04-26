import React from 'react';
import './TitleBar.css';
import logo from '../assets/logo.png';

const TitleBar = () => {
    const isElectron = window.electronAPI !== undefined;

    if (!isElectron) return null;

    const handleMinimize = () => {
        window.electronAPI.minimize();
    };

    const handleMaximize = () => {
        window.electronAPI.maximize();
    };

    const handleClose = () => {
        window.electronAPI.close();
    };

    return (
        <div className="titlebar">
            <div className="titlebar-drag-region"></div>
            <div className="titlebar-content">
                <div className="titlebar-logo">
                    <img src={logo} alt="Logo" />
                    <span>Phonolytics</span>
                </div>
                <div className="titlebar-controls">
                    <button className="control-btn minimize" onClick={handleMinimize} title="Minimize">
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <rect fill="currentColor" width="10" height="1" x="1" y="6"></rect>
                        </svg>
                    </button>
                    <button className="control-btn maximize" onClick={handleMaximize} title="Maximize">
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <rect fill="none" stroke="currentColor" strokeWidth="1" width="9" height="9" x="1.5" y="1.5"></rect>
                        </svg>
                    </button>
                    <button className="control-btn close" onClick={handleClose} title="Close">
                        <svg width="12" height="12" viewBox="0 0 12 12">
                            <path fill="currentColor" d="M11 1.576L10.424 1 6 5.424 1.576 1 1 1.576 5.424 6 1 10.424 1.576 11 6 6.576 10.424 11 11 10.424 6.576 6 11 1.576z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TitleBar;
