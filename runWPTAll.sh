HEADLESS=false exec npm run wpt -- "$@"
HEADLESS=true exec npm run wpt -- "$@"
CHROMEDRIVER=true exec npm run wpt -- "$@"