import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 10, cols: 50 });

// Simulate column header like CardColumn does
function TestColumnHeader() {
  const name = "US Financial Setup";
  const countDisplay = "(5)";
  const width = 30;
  const isColumnSelected = true;
  
  return (
    <Box flexDirection="column">
      <Text>--- Column header test (like CardColumn) ---</Text>
      
      <Text>1. Selected column (yellow bg, black text):</Text>
      <Box height={1} width={width}>
        <Text
          bold
          color="black"
          backgroundColor="yellow"
          wrap="truncate"
        >
          {" "}
          <Text color="black">●</Text>
          {" "}
          {name}
          <Text color="gray" dimColor={false}>{` ${countDisplay}`}</Text>
          {" ".repeat(Math.max(0, width - 4 - name.length - countDisplay.length))}
        </Text>
      </Box>
      
      <Text>2. NOT selected column:</Text>
      <Box height={1} width={width}>
        <Text
          bold
          color="yellow"
          dimColor={false}
          wrap="truncate"
        >
          {" "}
          <Text color="green">●</Text>
          {" "}
          {name}
          <Text dimColor>{` ${countDisplay}`}</Text>
        </Text>
      </Box>
    </Box>
  );
}

const { lastFrame } = render(<TestColumnHeader />);
console.log(lastFrame());
