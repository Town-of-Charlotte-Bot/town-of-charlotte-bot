*Besides the obvious major stuff, here are the (more bug-related) TODOs:*

 - If a player does `//game leave` in the middle of the game, have their role revealed and mark them as dead by suicide
 - Actions should not be allowed unless a game has been started, the player has already joined, and the game has actually begun
 - Prevent the Gamemaster from leaving or joining the current game
 - Make sure actions cannot be taken by the player unless they are in the current game and alive
 - Redo method for assigning roles, so that *after* the game has begun the roles are assigned (to make sure roles like GF are always in the game *but* assigned randomly)
 - Set a minimum players count, so that enough players have to join before a game can begin (and some way to cancel if there aren't enough)
 - For action commands, make everything after the second parameter part of the same argument, so that usernames with spaces aren't split
 - Add support for multiple concurrent games
 - Prevent multiple people from being lynched in the same day, and only lynching after the first day
 - Psychopath wins with whichever team wins (not immediately after their target is lynched)
 - In the case of a targeting stalemate (like SK and GF targeting each other) neither player dies
 - Move all unique identifying over to player ids instead of usernames
