"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Minus, Move, Pin, Folder } from "lucide-react";
import { Input } from "./ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { ImageWithFallback } from "./figma/ImageWithFallback";

interface FolderItem {
  id: string;
  name: string;
  isOpen: boolean;
  isSelected: boolean;
  children?: FolderItem[];
}

interface SearchResult {
  id: string;
  name: string;
  path: string[];
  service: string;
}

interface TopNavigationProps {
  isDark: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenterMap: () => void;
  folderData?: FolderItem[];
}

export function TopNavigation({
  isDark,
  zoom,
  onZoomIn,
  onZoomOut,
  onCenterMap,
  folderData = [],
}: TopNavigationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const HIDE_DELAY_MS = 200; // configurable fade delay

  // ✅ Correct logo paths (served from /public/assets)
  const serviceLogos: Record<string, string> = {
    Notion: "/assets/notion-logo.png",
    OneDrive: "/assets/onedrive-logo.png",
    Dropbox: "/assets/dropbox-logo.png",
    "Google Drive": "/assets/google-drive-logo.png",
  };

  const flattenFolders = (
    folders: FolderItem[],
    serviceName = "",
    currentPath: string[] = []
  ): SearchResult[] => {
    const results: SearchResult[] = [];
    folders.forEach((folder) => {
      const isService = currentPath.length === 0;
      const newPath = isService ? [folder.name] : [...currentPath, folder.name];
      const service = isService ? folder.name : serviceName;
      results.push({
        id: folder.id,
        name: folder.name,
        path: newPath,
        service,
      });
      if (folder.children) {
        results.push(...flattenFolders(folder.children, service, newPath));
      }
    });
    return results;
  };

  // 🧭 Show/hide top bar only inside canvas region
  useEffect(() => {
    let hideTimeoutId: NodeJS.Timeout;

    const handleMouseMove = (e: MouseEvent) => {
      const isInTopZone = e.clientY <= 50;
      const windowWidth = window.innerWidth;
      const leftSidebarWidth = 100;
      const rightMenuStart = windowWidth - 300;
      const isInCanvasRegion =
        e.clientX > leftSidebarWidth && e.clientX < rightMenuStart;

      if ((isInTopZone && isInCanvasRegion) || isTyping || isPinned) {
        if (hideTimeoutId) clearTimeout(hideTimeoutId);
        setIsVisible(true);
      } else if (!isPinned && !isTyping) {
        if (hideTimeoutId) clearTimeout(hideTimeoutId);
        hideTimeoutId = setTimeout(() => {
          if (!isPinned && !isTyping) setIsVisible(false);
        }, HIDE_DELAY_MS);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
    };
  }, [isPinned, isTyping, HIDE_DELAY_MS]);

  // 🔍 Search logic
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        const flatFolders = flattenFolders(folderData);
        const searchTerm = searchQuery.toLowerCase();
        const directMatches = flatFolders.filter((folder) =>
          folder.name.toLowerCase().includes(searchTerm)
        );
        const filteredResults = directMatches.slice(0, 8);
        setSearchResults(filteredResults);
        setShowSearchResults(true);
      }, 200);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, folderData]);

  // Click outside search box
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleZoomIn = () => onZoomIn();
  const handleZoomOut = () => onZoomOut();
  const handleCenterMap = () => onCenterMap();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) =>
    setSearchQuery(e.target.value);

  const handlePin = () => {
    setIsPinned(!isPinned);
    if (!isPinned) setIsVisible(true);
  };

  const handleSearchResultClick = (result: SearchResult) => {
    setSearchQuery("");
    setShowSearchResults(false);
    console.log("Navigate to:", result);
  };

  const getServiceIcon = (serviceName: string) => {
    const logo = serviceLogos[serviceName];
    return logo ? (
      <img
        src={logo}
        alt={serviceName}
        className="w-4 h-4 rounded-sm object-contain"
      />
    ) : (
      <Folder size={14} />
    );
  };

  return (
    <AnimatePresence>
      {(isVisible || isPinned || isTyping) && (
        <div className="fixed top-4 left-[64px] right-[64px] flex justify-center z-50">
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            <div
              className={`border border-border rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2 w-fit max-w-[90vw]
                ${isDark ? "bg-neutral-900" : "bg-white"}
              `}
            >
              {/* Pin Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handlePin}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                        isPinned
                          ? "bg-accent text-foreground"
                          : "hover:bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Pin size={16} className={isPinned ? "rotate-45" : ""} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isPinned ? "Unpin Menu" : "Pin Menu"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Search box */}
              <div
                className="w-[150px] sm:w-[225px] lg:w-[250px] relative"
                ref={searchContainerRef}
              >
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    placeholder="Search folders..."
                    value={searchQuery}
                    onChange={handleSearch}
                    onFocus={() => {
                      setIsTyping(true);
                      searchQuery.length >= 2 && setShowSearchResults(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setIsTyping(false), 150);
                    }}
                    className={`pl-9 h-8 rounded-lg text-sm border border-transparent transition-all duration-150
                      ${
                        isDark
                          ? "bg-neutral-800 text-white placeholder-neutral-400 focus:bg-neutral-700 focus:ring-1 focus:ring-blue-500/60"
                          : "bg-neutral-100 text-black placeholder-neutral-500 focus:bg-white focus:ring-1 focus:ring-blue-400/60"
                      }
                    `}
                  />
                </div>

                {/* Search Results */}
                <AnimatePresence>
                  {showSearchResults && searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className={`absolute top-full mt-2 w-80 border border-border rounded-lg shadow-lg z-60 max-h-64 overflow-y-auto
                        ${isDark ? "bg-neutral-900" : "bg-white"}
                      `}
                    >
                      <div className="p-2">
                        {searchResults.map((result) => {
                          const isServiceRoot = result.path.length === 1;

                          return (
                            <button
                              key={result.id}
                              onClick={() => handleSearchResultClick(result)}
                              className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                {getServiceIcon(result.service)}

                                <div className="flex-1 min-w-0">
                                  <div className="text-sm truncate">
                                    {isServiceRoot ? (
                                      <span className="text-foreground font-medium">
                                        {result.name}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-muted-foreground">
                                          {result.path
                                            .slice(0, -1)
                                            .join(" / ")}
                                        </span>
                                        <span className="text-muted-foreground"> / </span>
                                        <span className="text-foreground font-semibold">
                                          {result.path[result.path.length - 1]}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Center Map */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleCenterMap}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Move size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Center Map</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Zoom Controls */}
              <div className="flex items-center gap-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleZoomOut}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Minus size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Zoom Out</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="px-1 py-1 text-xs text-muted-foreground font-medium min-w-[40px] text-center">
                  {zoom}%
                </div>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleZoomIn}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Plus size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Zoom In</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
