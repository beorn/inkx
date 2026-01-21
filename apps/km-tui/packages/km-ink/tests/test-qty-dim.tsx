import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 15, cols: 60 });

// Test qty dimming scenarios from TabsView
function TestQtyDim() {
  return (
    <Box flexDirection="column">
      <Text>--- Qty dimming test (like TabsView) ---</Text>
      
      <Text>1. Tab NOT selected, at board level (all dim):</Text>
      <Text bold color="white" dimColor>
        Tab Name<Text dimColor>{" (5)"}</Text>
      </Text>
      
      <Text>2. Tab active but NOT selected (yellow, qty dim):</Text>
      <Text bold color="yellow">
        Tab Name<Text dimColor>{" (5)"}</Text>
      </Text>
      
      <Text>3. Tab selected (yellow bg, black text, qty dim):</Text>
      <Box backgroundColor="yellow">
        <Text bold color="black">
          {" "}Tab Name<Text dimColor>{" (5)"}</Text>{" "}
        </Text>
      </Box>
      
      <Text>4. Column header NOT selected:</Text>
      <Text bold color="yellowBright" dimColor>
        Column<Text dimColor>{" (3)"}</Text>
      </Text>
      
      <Text>5. Column header selected:</Text>
      <Box backgroundColor="yellow">
        <Text bold color="black">
          Column<Text dimColor>{" (3)"}</Text>
        </Text>
      </Box>
    </Box>
  );
}

const { lastFrame } = render(<TestQtyDim />);
console.log(lastFrame());
