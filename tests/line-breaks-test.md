# Line Break Test

This is the first line
This is the second line
This is the third line

All three lines above should appear on separate lines without needing double-spaces at the end.

[Continue](Paragraph Test)

## Paragraph Test

Paragraph breaks with double newlines should still work correctly.

This is a separate paragraph. It should have space above and below it.

Single line breaks work like this:
Line A
Line B
Line C

[Next](Formatting Test)

## Formatting Test

**Bold text on first line**
*Italic text on second line*
Normal text on third line

These should all be on separate lines with proper formatting.

You can also have longer text that wraps naturally within a line, but when you include an actual newline in your markdown source
it should create a line break in the output
rather than treating it as a space
like traditional markdown would do.

[Back to Start](Line Break Test) [Done](Complete)

## Complete

You've tested the line break behavior!

All tests should show:
- Single newlines create `<br>` tags
- Double newlines create paragraph breaks
- Formatting is preserved across line breaks

[Restart](Line Break Test)
