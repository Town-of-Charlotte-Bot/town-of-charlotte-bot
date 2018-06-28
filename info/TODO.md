*Besides the obvious major stuff, here are the (more bug-related) TODOs:*

 - If a player does `//game leave` in the middle of the game, have their role revealed and mark them as dead by suicide
 - Actions should not be allowed unless a game has been started, the player has already joined, and the game has actually begun
 - Prevent the Gamemaster from leaving or joining the current game
 - Make sure actions cannot be taken by the player unless they are in the current game and alive
 - Redo method for assigning roles, so that *after* the game has begun the roles are assigned (to make sure roles like GF are always in the game *but* assigned randomly)
