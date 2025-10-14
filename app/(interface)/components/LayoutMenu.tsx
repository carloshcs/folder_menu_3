import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Orbit, GitBranch, PieChart, Zap, FolderOpen } from 'lucide-react';

interface LayoutMenuProps {
  isOpen: boolean;
  onSelect: (optionId: string) => void;
  selectedLayout?: string | null;
}

interface LayoutSection {
  title: string;
  options: Array<{
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
  }>;
}

export function LayoutMenu({ isOpen, onSelect, selectedLayout }: LayoutMenuProps) {
  const layoutSections: LayoutSection[] = [
    {
      title: "Folder Exploration",
      options: [
        {
          id: 'orbital',
          label: 'Orbital',
          description: 'Circular orbit layout around central node',
          icon: <Orbit size={16} />
        },
        {
          id: 'tree',
          label: 'Tree',
          description: 'Hierarchical tree structure',
          icon: <GitBranch size={16} />
        },
        {
          id: 'sunburst',
          label: 'Sunburst',
          description: 'Radial hierarchical chart',
          icon: <PieChart size={16} />
        }
      ]
    },
    {
      title: "More Layouts",
      options: [
        {
          id: 'bubble-size',
          label: 'Bubble Size',
          description: 'Size-based bubble visualization',
          icon: <Zap size={16} />
        },
        {
          id: 'activity-folders',
          label: 'Activity Folders',
          description: 'Activity-based folder grouping',
          icon: <FolderOpen size={16} />
        }
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
          className="absolute left-16 top-0 bg-popover border border-border rounded-lg shadow-lg p-4 z-50 min-w-[280px]"
        >
          {layoutSections.map((section, sectionIndex) => (
            <div key={section.title} className={sectionIndex > 0 ? 'mt-4' : ''}>
              {/* Section Header */}
              <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
                {section.title}
              </div>
              
              {/* Section Options */}
              <div className="flex gap-2">
                {section.options.map((option) => {
                  const isSelected = selectedLayout === option.id;
                  return (
                  <button
                    key={option.id}
                    onClick={() => onSelect(option.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg min-w-[70px] h-[60px] transition-all duration-200 group
                      ${isSelected ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground'}`}
                    title={option.description}
                  >
                    <div className="mb-1 group-hover:scale-110 transition-transform duration-200">
                      {option.icon}
                    </div>
                    <span className="text-xs text-center leading-tight">{option.label}</span>
                  </button>
                );
                })}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}