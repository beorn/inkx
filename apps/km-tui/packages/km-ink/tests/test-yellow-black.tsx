import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 15, cols: 60 });

// Test various selection scenarios that should show yellow bg + black fg
function TestYellowBlack() {
  return (
    <Box flexDirection="column">
      <Text>--- Yellow bg should have black fg ---</Text>
      
      <Text>1. Column header selected (current behavior?):</Text>
      <Box backgroundColor="yellow">
        <Text bold color="black">
          {" "}Column Name<Text dimColor>{" (5)"}</Text>{" "}
        </Text>
      </Box>
      
      <Text>2. Tab selected:</Text>
      <Box backgroundColor="yellow">
        <Text bold color="black">
          {" "}Tab Name<Text dimColor>{" (3)"}</Text>{" "}
        </Text>
      </Box>
      
      <Text>3. Board name selected:</Text>
      <Box backgroundColor="yellow">
        <Text color="black">Board Name</Text>
      </Box>
      
      <Text>4. Section header selected:</Text>
      <Box backgroundColor="yellow">
        <Text bold color="black"># Section</Text>
      </Box>
      
      <Text>5. NOT selected (white text, no bg):</Text>
      <Text bold color="white">Column Name<Text dimColor>{" (5)"}</Text></Text>
    </Box>
  );
}

const { lastFrame } = render(<TestYellowBlack />);
console.log(lastFrame());
