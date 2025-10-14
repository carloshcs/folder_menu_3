"use client";

import React from "react";

interface GridOverlayProps {
  thickness: number;
  visible: boolean;
  darkMode?: boolean;
}

export function GridOverlay({ thickness, visible, darkMode }: GridOverlayProps) {
  // Don’t render if gridThickness = 0 or grid not visible
  if (!visible || thickness <= 0) return null;

  const color = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const size = 40; // grid cell size in px — adjust to match your Figma spacing

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-300"
      style={{
        backgroundImage: `
          linear-gradient(to right, ${color} 1px, transparent 1px),
          linear-gradient(to bottom, ${color} 1px, transparent 1px)
        `,
        backgroundSize: `${size}px ${size}px`,
        opacity: 1,
      }}
    />
  );
}
