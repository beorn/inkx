import React from "react";
import { render } from "ink-testing-library";
import { Box, Text } from "ink";

// Test: height constraint clips first line of bordered content
function TestHeightClipping() {
  console.log("Testing with different height values...\n");

  for (const h of [4, 5, 6, 7, 8, 10]) {
    const result = render(
      <Box flexDirection="column" width={20}>
        <Box flexDirection="row" width={20} height={h}>
          <Box flexDirection="column" width={20}>
            <Text>Header</Text>
            <Box borderStyle="round">
              <Box flexDirection="column" width={16}>
                <Text>FIRST LINE</Text>
                <Text>Line 2</Text>
                <Text>Line 3</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>,
    );
    console.log(`=== height=${h} ===`);
    console.log(result.lastFrame());
    console.log("");
  }
}

TestHeightClipping();
