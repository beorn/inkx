# Ordered list numbering

CommonMark ordered lists can start with any number; subsequent items
renumber automatically in rendered output but the source numbers can
be arbitrary.

## Starts at 1

1. Alpha
2. Beta
3. Gamma

## Starts at 5

5. Five
6. Six
7. Seven

## All 1s (auto-numbered on render)

1. First
1. Second
1. Third

## Non-sequential (HTML renders as 1,2,3)

1. First item
2. Jumped to 3
3. Jumped to 7

## Mixed markers — `.` and `)`

1. Dot marker
2. Dot marker

1) Paren marker
2) Paren marker
