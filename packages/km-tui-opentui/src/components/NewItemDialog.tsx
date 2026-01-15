/**
 * NewItemDialog Component
 *
 * Modal dialog for quick task creation.
 * Shows a text input with "New task:" prompt.
 */

interface NewItemDialogProps {
  text: string;
  width: number;
}

export function NewItemDialog({ text, width }: NewItemDialogProps) {
  // Center the dialog horizontally
  const dialogWidth = Math.min(60, width - 4);
  const paddingLeft = Math.floor((width - dialogWidth) / 2);

  return (
    <box
      position="absolute"
      top={5}
      left={paddingLeft}
      width={dialogWidth}
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
      <text color="cyan" bold>
        New task:
      </text>
      <box>
        <text color="white">{text}</text>
        <text color="cyan" inverse>
          {" "}
        </text>
      </box>
      <text color="gray" dim>
        Enter to create, Esc to cancel
      </text>
    </box>
  );
}

export default NewItemDialog;
