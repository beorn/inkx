import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 15 });

function TestNestedColor() {
  return (
    <Box flexDirection="column">
      <Text>--- Nested Text color test ---</Text>
      
      <Text>1. Parent has no color, child has red:</Text>
      <Text>
        before <Text color="red">RED</Text> after
      </Text>
      
      <Text>2. Parent has black color, child has red:</Text>
      <Text color="black">
        before <Text color="red">RED</Text> after
      </Text>
      
      <Text>3. Parent has black, child has red, yellow bg:</Text>
      <Box backgroundColor="yellow">
        <Text color="black">
          before <Text color="red">RED</Text> after
        </Text>
      </Box>
      
      <Text>4. No nested Text - direct red:</Text>
      <Box backgroundColor="yellow">
        <Text color="red">RED direct</Text>
      </Box>
    </Box>
  );
}

const { lastFrame } = render(<TestNestedColor />);
console.log(lastFrame());
