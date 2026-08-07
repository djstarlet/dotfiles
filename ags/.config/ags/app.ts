import app from "ags/gtk4/app"
import style from "./style.css"

import Bar from "./widget/Bar"

app.start({
  css: style,
  iconTheme: "Adwaita",
  requestHandler(argv, response) {
    if (argv[0] === "quit") {
      app.quit(0)
      response("ok")
    }
    response("unknown command")
  },
  main() {
    app.get_monitors().map(Bar)
  },
})
