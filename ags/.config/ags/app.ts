import app from "ags/gtk4/app"
import style from "./style.css"

// Swap to MinimalTest for direct minimal widget test
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
