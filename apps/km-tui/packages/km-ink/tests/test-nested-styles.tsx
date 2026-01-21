import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";

const render = createTestRenderer({ rows: 20, cols: 60 });

function TestNestedStyles() {
  return (
    <Box flexDirection="column">
      <Text>--- Nested style push/pop test ---</Text>
      
      <Text>1. Parent black, child red, restore to black:</Text>
      <Text color="black">
        before <Text color="red">RED</Text> after
      </Text>
      
      <Text>2. Parent bold white, child dim count, restore bold:</Text>
      <Text bold color="white">
        Title<Text dimColor>{" (5)"}</Text> more
      </Text>
      
      <Text>3. Parent yellow on selection bg, child dim:</Text>
      <Box backgroundColor="yellow">
        <Text bold color="black">
          Tab<Text dimColor>{" (3)"}</Text> end
        </Text>
      </Box>
      
      <Text>4. Deep nesting: white > red > blue > back to red > back to white:</Text>
      <Text color="white">
        W<Text color="red">R<Text color="blue">B</Text>R</Text>W
      </Text>
      
      <Text>5. Multiple styles: bold+green > dim+red > restore bold+green:</Text>
      <Text bold color="green">
        GREEN<Text dim color="red">red</Text>GREEN
      </Text>
    </Box>
  );
}

const { lastFrame } = render(<TestNestedStyles />);
console.log(lastFrame());
