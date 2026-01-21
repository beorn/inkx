import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 15 });

function TestDimColor() {
  return (
    <Box flexDirection="column">
      <Text>--- Parent not dim, child dim ---</Text>
      <Text color="white">
        Title <Text dimColor>(count)</Text>
      </Text>
      
      <Text>--- Parent not dim, child gray ---</Text>
      <Text color="white">
        Title <Text color="gray">(count)</Text>
      </Text>
      
      <Text>--- Parent dim, child not dim (should override) ---</Text>
      <Text dimColor color="white">
        Title <Text dimColor={false}>(count)</Text>
      </Text>
      
      <Text>--- Yellow header, gray count (selected column) ---</Text>
      <Text bold color="black" backgroundColor="yellow">
        Column Name <Text color="gray">(5)</Text>
      </Text>
      
      <Text>--- White header, dim count (unselected column) ---</Text>
      <Text bold color="white">
        Column Name <Text dimColor>(5)</Text>
      </Text>
    </Box>
  );
}

const { lastFrame } = render(<TestDimColor />);
console.log(lastFrame());
