import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 10, cols: 60 });

function TestTruncation() {
  const longName = "This is a very long column title that will be truncated";
  const shortName = "Short";
  const width = 25;
  
  return (
    <Box flexDirection="column">
      <Text>--- Truncation test ---</Text>
      
      <Text>1. Long name in 25 char width:</Text>
      <Box height={1} width={width}>
        <Text wrap="truncate">
          {" "}{longName}{" (5)"}
        </Text>
      </Box>
      
      <Text>2. With nested Text for count:</Text>
      <Box height={1} width={width}>
        <Text wrap="truncate">
          {" "}{longName}<Text dimColor>{" (5)"}</Text>
        </Text>
      </Box>
      
      <Text>3. Short name (no truncation needed):</Text>
      <Box height={1} width={width}>
        <Text wrap="truncate">
          {" "}{shortName}<Text dimColor>{" (5)"}</Text>
        </Text>
      </Box>
    </Box>
  );
}

const { lastFrame } = render(<TestTruncation />);
console.log(lastFrame());
