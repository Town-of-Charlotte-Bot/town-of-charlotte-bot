*Besides the obvious major stuff, here are the (more bug-related) TODOs:*

 - [x] If a player does `//game leave` in the middle of the game, have their role revealed and mark them as dead by suicide
 - [x] Actions should not be allowed unless a game has been started, the player has already joined, and the game has actually begun
 - [x] Prevent the Gamemaster from leaving or joining the current game
 - [x] Make sure actions cannot be taken by the player unless they are in the current game and alive
 - [x] Redo method for assigning roles, so that *after* the game has begun the roles are assigned (to make sure roles like GF are always in the game *but* assigned randomly)
 - [x] Set a minimum players count, so that enough players have to join before a game can begin (and some way to cancel if there aren't enough)
 - [x] For action commands, make everything after the second parameter part of the same argument, so that usernames with spaces aren't split
 - [x] Add support for multiple concurrent games
 - [x] Prevent multiple people from being lynched in the same day, and only lynching after the first day
 - [x] Psychopath wins with whichever team wins (not immediately after their target is lynched)
 - [x] In the case of a targeting stalemate (like SK and GF targeting each other) neither player dies
 - [x] Move all unique identifying over to player ids instead of usernames
