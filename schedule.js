run = function() {
    var request = new XMLHttpRequest();
    request.onload = function() {
        console.log(this.response);
    };
    request.open("GET", "https://www.khanacademy.org/api/internal/discussions/scratchpad/6221507115941888/comments?sort=2", true);
    request.send();
};
run();
