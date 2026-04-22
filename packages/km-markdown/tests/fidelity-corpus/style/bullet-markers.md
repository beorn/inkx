# Bullet marker variations

CommonMark accepts `-`, `*`, and `+` as unordered-list bullets. The
serializer picks one convention, but parsing must preserve or normalize
them consistently.

## Dashes

- Alpha
- Beta
- Gamma

## Asterisks

* Alpha
* Beta
* Gamma

## Pluses

+ Alpha
+ Beta
+ Gamma

## Mixed

- Dash
* Asterisk
+ Plus

(A new list starts when the marker changes under CommonMark — so the
above is three separate single-item lists, not one three-item list.)
