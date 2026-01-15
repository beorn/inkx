/**
 * ProjectPicker Component
 *
 * Modal dialog for fuzzy search and navigation to projects/boards.
 * Shows a search input at top with filtered list of projects below.
 */

interface ProjectItem {
  id: string;
  title: string;
  itemCount: number;
}

interface ProjectPickerProps {
  projects: ProjectItem[];
  query: string;
  selectedIndex: number;
  width: number;
  height: number;
}

export function ProjectPicker({
  projects,
  query,
  selectedIndex,
  width,
  height,
}: ProjectPickerProps) {
  // Center the dialog
  const dialogWidth = Math.min(60, width - 4);
  const dialogHeight = Math.min(20, height - 4);
  const paddingLeft = Math.floor((width - dialogWidth) / 2);
  const paddingTop = Math.floor((height - dialogHeight) / 2);

  // Filter projects by query (case-insensitive fuzzy match)
  const filteredProjects = query
    ? projects.filter((p) =>
        p.title.toLowerCase().includes(query.toLowerCase()),
      )
    : projects;

  // Content width inside the border (accounting for padding)
  const contentWidth = dialogWidth - 4;

  // Max items to display (reserve space for header, input, hints)
  const maxVisibleItems = Math.max(1, dialogHeight - 6);
  const visibleProjects = filteredProjects.slice(0, maxVisibleItems);

  return (
    <box
      position="absolute"
      top={paddingTop}
      left={paddingLeft}
      width={dialogWidth}
      height={dialogHeight}
      border
      borderStyle="single"
      borderColor="cyan"
      backgroundColor="black"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
    >
      {/* Header */}
      <text color="cyan" bold>
        Go to project:
      </text>

      {/* Search input */}
      <box>
        <text color="white">{query}</text>
        <text color="cyan" inverse>
          {" "}
        </text>
      </box>

      {/* Spacer */}
      <text> </text>

      {/* Project list */}
      {visibleProjects.length === 0 ? (
        <text color="gray" dim>
          No matching projects
        </text>
      ) : (
        visibleProjects.map((project, index) => {
          const isSelected = index === selectedIndex;
          // Truncate title if needed to make room for item count
          const countStr = ` (${project.itemCount})`;
          const maxTitleWidth = contentWidth - countStr.length - 2; // -2 for arrow prefix
          const displayTitle =
            project.title.length > maxTitleWidth
              ? project.title.slice(0, maxTitleWidth - 1) + "..."
              : project.title;

          return (
            <text
              key={project.id}
              backgroundColor={isSelected ? "cyan" : undefined}
              color={isSelected ? "black" : "white"}
            >
              {isSelected ? " > " : "   "}
              {displayTitle}
              <text
                color={isSelected ? "black" : "gray"}
                dim={!isSelected}
                backgroundColor={isSelected ? "cyan" : undefined}
              >
                {countStr}
              </text>
            </text>
          );
        })
      )}

      {/* Show count if there are more items */}
      {filteredProjects.length > maxVisibleItems && (
        <text color="gray" dim>
          ... and {filteredProjects.length - maxVisibleItems} more
        </text>
      )}

      {/* Spacer to push hints to bottom */}
      <box flexGrow={1} />

      {/* Hints */}
      <text color="gray" dim>
        j/k or arrows to navigate, Enter to select, Esc to cancel
      </text>
    </box>
  );
}

export default ProjectPicker;
