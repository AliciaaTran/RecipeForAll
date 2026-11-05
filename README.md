# RecipeForAll
A website that let you pick your meal, including filtering options to fit on your interest. 

# Introduction
This website uses an API call to themealdb.com to fetch for recipe of a specific dish. There are also filtering options based on ingredient, area and category. Also, there is an option that present the user with a surprise meal. Most of the underlying backend structure and functions are hand-coded by me, and Claude helped fixing minor bugs and developing a better front end. This is also my first project. 

# How to run site
The site needs a local web server, because it loads its JavaScript as modules. From the project folder, run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000/public/web.html in your browser.

# How to run tests
You need [Node.js](https://nodejs.org) 18 or newer. From the project folder, run:

```bash
npm test
```

The tests use a fake version of the API, so they run without an internet connection.
