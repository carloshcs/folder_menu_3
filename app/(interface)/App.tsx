"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { RightSidebar } from "./components/RightSidebar";
import { TopNavigation } from "./components/TopNavigation";
import { TextBox } from "./components/TextBox";
import { TextToolbar } from "./components/TextToolbar";
import { TextFormat } from "./components/TextFormatDialog";
import { CommentBox, Comment } from "./components/CommentBox";
import { BubbleSizeMap } from "./components/maps-layout";

interface FolderItem {
  id: string;
  name: string;
  isOpen: boolean;
  isSelected: boolean;
  children?: FolderItem[];
}

interface TextElement {
  id: string;
  x: number;
  y: number;
  text: string;
  format: TextFormat;
  type: 'text';
}

interface CommentElement {
  id: string;
  x: number;
  y: number;
  comments: Comment[];
  isExpanded: boolean;
}

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [mapPosition, setMapPosition] = useState({
    x: 0,
    y: 0,
  });
  const [showGrid, setShowGrid] = useState(true);
  const [gridThickness, setGridThickness] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastDragPosition, setLastDragPosition] = useState({
    x: 0,
    y: 0,
  });
  const [folderData, setFolderData] = useState<FolderItem[]>([]);
  const [isTextMode, setIsTextMode] = useState(false);
  const [isBoxMode, setIsBoxMode] = useState(false);
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [selectedBoxType, setSelectedBoxType] = useState<string>('box');
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [commentElements, setCommentElements] = useState<CommentElement[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [isTextDragging, setIsTextDragging] = useState(false);
  const [isCommentDragging, setIsCommentDragging] = useState(false);
  const [currentMap, setCurrentMap] = useState('My Project Map');
  const [existingMaps, setExistingMaps] = useState(['My Project Map', 'Team Workspace', 'Design System', 'Marketing Campaign']);
  const [selectedLayout, setSelectedLayout] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapContentRef = useRef<HTMLDivElement>(null);

  // Check for saved theme preference or default to light mode
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);

    if (newIsDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 25, 300));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 25, 25));
  };

  const handleCenterMap = () => {
    setMapPosition({ x: 0, y: 0 });
    setZoom(100);
  };

  const toggleGrid = () => {
    setShowGrid(!showGrid);
  };

  const handleGridThicknessChange = (thickness: number) => {
    setGridThickness(thickness);
  };

  const handleFolderDataChange = (folders: FolderItem[]) => {
    setFolderData(folders);
  };

  const handleLayoutSelect = (layoutId: string) => {
    setSelectedLayout(previous => (previous === layoutId ? null : layoutId));
    setIsTextMode(false);
    setIsBoxMode(false);
    setIsCommentMode(false);
    setSelectedTextId(null);
    setSelectedCommentId(null);
  };

  // Default text format
  const defaultTextFormat: TextFormat = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: 16,
    textColor: isDark ? '#ffffff' : '#000000',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderThickness: 1,
    borderColor: isDark ? '#444444' : '#cccccc',
    boxType: 'box',
    width: 150,
    height: 60,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    textAlign: 'center',
    link: undefined,
  };

  const handleTextModeToggle = () => {
    setIsTextMode(!isTextMode);
    setIsBoxMode(false);
    setIsCommentMode(false);
    setSelectedTextId(null);
    setSelectedCommentId(null);
  };

  const handleCreateBox = (boxType: string) => {
    setSelectedBoxType(boxType);
    setIsBoxMode(true);
    setIsTextMode(false);
    setIsCommentMode(false);
    setSelectedTextId(null);
    setSelectedCommentId(null);
  };

  const handleCommentModeToggle = () => {
    setIsCommentMode(!isCommentMode);
    setIsTextMode(false);
    setIsBoxMode(false);
    setSelectedTextId(null);
    setSelectedCommentId(null);
  };

  const createTextElement = (clientX: number, clientY: number) => {
    if (!mapRef.current) return;
    
    const rect = mapRef.current.getBoundingClientRect();
    // Account for the left sidebar offset (64px)
    const x = (clientX - rect.left - 64 - mapPosition.x) / (zoom / 100);
    const y = (clientY - rect.top - mapPosition.y) / (zoom / 100);
    
    const newText: TextElement = {
      id: `text-${Date.now()}`,
      x: x,
      y: y,
      text: currentMap, // Default to current map name
      format: defaultTextFormat,
      type: 'text',
    };
    
    setTextElements(prev => [...prev, newText]);
    setSelectedTextId(newText.id);
    setIsTextMode(false);
  };

  const createCommentElement = (clientX: number, clientY: number) => {
    if (!mapRef.current) return;
    
    const rect = mapRef.current.getBoundingClientRect();
    // Account for the left sidebar offset (64px)
    const x = (clientX - rect.left - 64 - mapPosition.x) / (zoom / 100);
    const y = (clientY - rect.top - mapPosition.y) / (zoom / 100);
    
    const newComment: CommentElement = {
      id: `comment-${Date.now()}`,
      x: x,
      y: y,
      comments: [],
      isExpanded: true, // Start expanded so user can add first comment
    };
    
    setCommentElements(prev => [...prev, newComment]);
    setSelectedCommentId(newComment.id);
    setIsCommentMode(false);
  };

  const createBoxElement = (clientX: number, clientY: number) => {
    if (!mapRef.current) return;
    
    const rect = mapRef.current.getBoundingClientRect();
    // Account for the left sidebar offset (64px)
    const x = (clientX - rect.left - 64 - mapPosition.x) / (zoom / 100);
    const y = (clientY - rect.top - mapPosition.y) / (zoom / 100);
    
    // Set defaults with transparent background and black border for all boxes
    let boxFormat: TextFormat = {
      ...defaultTextFormat,
      boxType: selectedBoxType as any,
      backgroundColor: 'transparent', // Default transparent for all
      borderStyle: 'solid',
      borderThickness: 2,
      borderColor: '#000000', // Default black border for all
    };

    // Customize defaults for specific box types
    switch (selectedBoxType) {
      case 'parallelogram':
        boxFormat = {
          ...boxFormat,
          width: 200,
          height: 150,
        };
        break;
      case 'postit':
        boxFormat = {
          ...boxFormat,
          backgroundColor: '#fef08a', // Keep yellow for post-it as requested
          width: 180,
          height: 120,
        };
        break;
      case 'dialogue':
        boxFormat = {
          ...boxFormat,
          width: 200,
          height: 100,
        };
        break;
      case 'circle':
        boxFormat = {
          ...boxFormat,
          width: 120,
          height: 120,
        };
        break;
      case 'rounded':
        boxFormat = {
          ...boxFormat,
          width: 160,
          height: 100,
        };
        break;
      default:
        boxFormat = {
          ...boxFormat,
          width: 150,
          height: 100,
        };
    }
    
    const newBox: TextElement = {
      id: `box-${Date.now()}`,
      x: x,
      y: y,
      text: currentMap, // Default to current map name
      format: boxFormat,
      type: 'text',
    };
    
    setTextElements(prev => [...prev, newBox]);
    setSelectedTextId(newBox.id);
    setIsBoxMode(false);
  };

  const handleTextChange = (id: string, text: string) => {
    setTextElements(prev => 
      prev.map(el => el.id === id ? { ...el, text } : el)
    );
  };

  const handleTextPositionChange = (id: string, x: number, y: number) => {
    setTextElements(prev => 
      prev.map(el => el.id === id ? { ...el, x, y } : el)
    );
  };

  const handleTextFormatChange = (id: string, format: TextFormat) => {
    setTextElements(prev => 
      prev.map(el => el.id === id ? { ...el, format } : el)
    );
  };

  const handleTextSelect = (id: string) => {
    setSelectedTextId(id);
  };

  const handleTextDragStart = () => {
    setIsTextDragging(true);
  };

  const handleTextDragEnd = () => {
    setIsTextDragging(false);
  };

  const handleTextDelete = (id: string) => {
    setTextElements(prev => prev.filter(el => el.id !== id));
    if (selectedTextId === id) {
      setSelectedTextId(null);
    }
  };

  const handleCommentPositionChange = (id: string, x: number, y: number) => {
    setCommentElements(prev => 
      prev.map(el => el.id === id ? { ...el, x, y } : el)
    );
  };

  const handleCommentSelect = (id: string) => {
    setSelectedCommentId(id);
    setSelectedTextId(null); // Deselect text when selecting comment
  };

  const handleCommentToggleExpand = (id: string) => {
    setCommentElements(prev => 
      prev.map(el => el.id === id ? { ...el, isExpanded: !el.isExpanded } : el)
    );
  };

  const handleCommentAdd = (commentId: string, content: string) => {
    const newComment: Comment = {
      id: `comment-${Date.now()}-${Math.random()}`,
      author: 'Carlos Saunders',
      authorInitials: 'CS',
      content: content,
      timestamp: new Date()
    };

    setCommentElements(prev => 
      prev.map(el => 
        el.id === commentId 
          ? { ...el, comments: [...el.comments, newComment] }
          : el
      )
    );
  };

  const handleCommentDelete = (id: string) => {
    console.log('handleCommentDelete called with id:', id);
    console.log('Current comment elements:', commentElements);
    const newElements = commentElements.filter(el => el.id !== id);
    console.log('New comment elements after delete:', newElements);
    setCommentElements(newElements);
    if (selectedCommentId === id) {
      setSelectedCommentId(null);
    }
  };

  const handleCommentDragStart = () => {
    setIsCommentDragging(true);
  };

  const handleCommentDragEnd = () => {
    setIsCommentDragging(false);
  };

  const handleMapNameUpdate = (oldName: string, newName: string) => {
    setExistingMaps(prev => prev.map(map => map === oldName ? newName : map));
    if (currentMap === oldName) {
      setCurrentMap(newName);
    }
  };



  // Handle scroll wheel zoom with cursor focus
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    // Get cursor position relative to the map (accounting for sidebar offset)
    const cursorX = e.clientX - rect.left - 64; // Subtract left sidebar width
    const cursorY = e.clientY - rect.top;

    // Calculate the point in the world coordinates that's under the cursor
    const worldX = (cursorX - mapPosition.x) / (zoom / 100);
    const worldY = (cursorY - mapPosition.y) / (zoom / 100);

    const oldZoom = zoom;
    let newZoom;

    if (e.deltaY < 0) {
      // Scroll up - zoom in
      newZoom = Math.min(oldZoom + 10, 300);
    } else {
      // Scroll down - zoom out
      newZoom = Math.max(oldZoom - 10, 25);
    }

    // Calculate the new position to keep the world point under the cursor
    const newWorldX = worldX * (newZoom / 100);
    const newWorldY = worldY * (newZoom / 100);

    const newMapX = cursorX - newWorldX;
    const newMapY = cursorY - newWorldY;

    setZoom(newZoom);
    setMapPosition({ x: newMapX, y: newMapY });
  };

  // Handle drag functionality - only right-click to avoid conflicts with text box resizing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isTextMode && e.button === 0) {
      // Create text element in text mode
      createTextElement(e.clientX, e.clientY);
      return;
    }

    if (isBoxMode && e.button === 0) {
      // Create box element in box mode
      createBoxElement(e.clientX, e.clientY);
      return;
    }

    if (isCommentMode && e.button === 0) {
      // Create comment element in comment mode
      createCommentElement(e.clientX, e.clientY);
      return;
    }

    if (e.button === 2) {
      // Only right mouse button for map dragging
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setLastDragPosition(mapPosition);
      setSelectedTextId(null); // Deselect text when clicking map
      setSelectedCommentId(null); // Deselect comment when clicking map
      e.preventDefault();
    } else if (e.button === 0) {
      // Left click just deselects text and comments, doesn't drag map
      setSelectedTextId(null);
      setSelectedCommentId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      const newPosition = {
        x: lastDragPosition.x + deltaX,
        y: lastDragPosition.y + deltaY,
      };

      setMapPosition(newPosition);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;

        const newPosition = {
          x: lastDragPosition.x + deltaX,
          y: lastDragPosition.y + deltaY,
        };

        setMapPosition(newPosition);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected elements when Delete key is pressed
      if (e.key === 'Delete') {
        if (selectedTextId) {
          e.preventDefault();
          handleTextDelete(selectedTextId);
        } else if (selectedCommentId) {
          e.preventDefault();
          handleCommentDelete(selectedCommentId);
        }
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDragging, dragStart, lastDragPosition, selectedTextId, selectedCommentId]);

  // Cloud service mockups
  const cloudServices = [
    {
      id: "notion",
      name: "Notion",
      color: "bg-[#000000] text-white",
      position: { x: 400, y: 300 },
    },
    {
      id: "onedrive",
      name: "OneDrive",
      color: "bg-[#0078d4] text-white",
      position: { x: 800, y: 300 },
    },
    {
      id: "dropbox",
      name: "Dropbox",
      color: "bg-[#0061ff] text-white",
      position: { x: 600, y: 500 },
    },
  ];

  return (
    <div className="min-h-screen bg-background transition-colors duration-200 overflow-hidden">
      {/* Fixed UI Elements */}
      <Sidebar
        isDark={isDark}
        onToggleDark={toggleDarkMode}
        showGrid={showGrid}
        onToggleGrid={toggleGrid}
        gridThickness={gridThickness}
        onGridThicknessChange={handleGridThicknessChange}
        onCreateText={handleTextModeToggle}
        isTextMode={isTextMode}
        onCreateBox={handleCreateBox}
        onCenterMap={handleCenterMap}
        onCreateComment={handleCommentModeToggle}
        isCommentMode={isCommentMode}
        onLayoutSelect={handleLayoutSelect}
        selectedLayout={selectedLayout}
      />
      <RightSidebar 
        isDark={isDark} 
        onFolderDataChange={handleFolderDataChange}
        currentMap={currentMap}
        existingMaps={existingMaps}
        onMapChange={setCurrentMap}
        onMapNameUpdate={handleMapNameUpdate}
      />
      <TopNavigation
        isDark={isDark}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCenterMap={handleCenterMap}
        folderData={folderData}
      />

      {/* Map Area */}
      <div
        ref={mapRef}
        className={`fixed inset-0 overflow-hidden ${
          isTextMode || isBoxMode || isCommentMode ? "cursor-crosshair" : 
          isDragging ? "cursor-grabbing" : "cursor-default"
        }`}
        style={{
          paddingLeft: "64px", // Left sidebar width (48px + 16px margin)
          paddingRight: "64px", // Right sidebar width (48px + 16px margin)
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()} // Disable context menu on right-click
      >
        {/* Map Content Container */}
        <div
          ref={mapContentRef}
          className="relative"
          style={{
            width: "100%",
            height: "100%",
            transform: `translate(${mapPosition.x}px, ${mapPosition.y}px) scale(${zoom / 100})`,
            transformOrigin: "0 0",
          }}
        >
        {/* Map Background Grid - Only show if enabled and thickness > 0 */}
        {showGrid && gridThickness > 0 && (() => {
          // Calculate adaptive grid size based on zoom level
          const baseGridSize = 50;
          const zoomFactor = zoom / 100;
          let gridSize = baseGridSize;
          let gridOpacity = 0.3;

          if (zoomFactor > 4) {
            gridSize = baseGridSize / 4;
            gridOpacity = 0.2;
          } else if (zoomFactor > 2) {
            gridSize = baseGridSize / 2;
            gridOpacity = 0.25;
          } else if (zoomFactor < 0.3) {
            gridSize = baseGridSize * 4;
            gridOpacity = 0.4;
          } else if (zoomFactor < 0.7) {
            gridSize = baseGridSize * 2;
            gridOpacity = 0.35;
          }

          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: "-50000px",
                top: "-50000px",
                width: "100000px",
                height: "100000px",
                opacity: gridOpacity,
                backgroundImage: `
                  linear-gradient(to right, var(--border) ${gridThickness}px, transparent ${gridThickness}px),
                  linear-gradient(to bottom, var(--border) ${gridThickness}px, transparent ${gridThickness}px)
                `,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: "0px 0px",
              }}
            />
          );
        })()}


          {selectedLayout === 'bubble-size' ? (
            <BubbleSizeMap folders={folderData} />
          ) : (
            <>
              {/* Cloud Service Icons - Fixed size */}
              {cloudServices.map((service) => (
                <div
                  key={service.id}
                  className={`absolute rounded-xl border-2 border-transparent hover:border-white/20 transition-all duration-200 ${service.color} shadow-lg hover:shadow-xl cursor-pointer select-none`}
                  style={{
                    left: service.position.x + "px",
                    top: service.position.y + "px",
                    width: "120px",
                    height: "80px",
                  }}
                >
                  <div className="p-4 h-full flex items-center justify-center text-center">
                    <span className="font-medium text-sm">
                      {service.name}
                    </span>
                  </div>
                </div>
              ))}

              {/* Text Elements */}
              {textElements.map((textElement) => (
                <TextBox
                  key={textElement.id}
                  id={textElement.id}
                  x={textElement.x}
                  y={textElement.y}
                  text={textElement.text}
                  format={textElement.format}
                  isSelected={selectedTextId === textElement.id}
                  zoom={zoom}
                  onTextChange={handleTextChange}
                  onPositionChange={handleTextPositionChange}
                  onFormatChange={handleTextFormatChange}
                  onSelect={handleTextSelect}
                  onDragStart={handleTextDragStart}
                  onDragEnd={handleTextDragEnd}
                />
              ))}

              {/* Comment Elements */}
              {commentElements.map((commentElement) => (
                <CommentBox
                  key={commentElement.id}
                  id={commentElement.id}
                  x={commentElement.x}
                  y={commentElement.y}
                  comments={commentElement.comments}
                  isSelected={selectedCommentId === commentElement.id}
                  isExpanded={commentElement.isExpanded}
                  zoom={zoom}
                  onPositionChange={handleCommentPositionChange}
                  onSelect={handleCommentSelect}
                  onToggleExpand={handleCommentToggleExpand}
                  onAddComment={handleCommentAdd}
                  onDelete={handleCommentDelete}
                  onDragStart={handleCommentDragStart}
                  onDragEnd={handleCommentDragEnd}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Text Toolbar - only show when text is selected and not dragging */}
      {selectedLayout !== 'bubble-size' && selectedTextId && !isTextDragging && !isCommentDragging && (
        (() => {
          const selectedElement = textElements.find(el => el.id === selectedTextId);
          if (!selectedElement) return null;

          return (
            <TextToolbar
              x={(selectedElement.x * zoom / 100) + mapPosition.x + 64} // Add left sidebar offset and apply zoom
              y={(selectedElement.y * zoom / 100) + mapPosition.y}
              format={selectedElement.format}
              onFormatChange={(format) => handleTextFormatChange(selectedTextId, format)}
              onDelete={() => handleTextDelete(selectedTextId)}
              zoom={zoom}
            />
          );
        })()
      )}
    </div>
  );
}