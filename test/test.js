import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { meal, findMeal, findID, filterByIngre, filterByCate, filterByArea, searchMeals, lookupAll, listACIClosure } from "../src/utils.js";

//build a raw API meal object with 20 ingredient/measure slots like TheMealDB returns
function rawMeal(id, name, pairs) {
    const obj = { idMeal: String(id), strMeal: name, strTags: null };
    for (let i = 1; i <= 20; i++) {
        const [ingre, measure] = pairs[i - 1] ?? ["", ""];
        obj[`strIngredient${i}`] = ingre;
        obj[`strMeasure${i}`] = measure;
    }
    return obj;
}

//replace global fetch with a fake that answers from a url -> json map
const realFetch = globalThis.fetch;
function mockFetch(routes) {
    globalThis.fetch = async (url) => {
        const key = Object.keys(routes).find((k) => url.includes(k));
        if (!key) {throw new Error(`Unexpected fetch: ${url}`);}
        return { ok: true, json: async () => routes[key] };
    };
}
afterEach(() => { globalThis.fetch = realFetch; });

test("meal keeps ingredients and measures aligned when a measure is blank", () => {
    const m = new meal(rawMeal(1, "Pancakes", [["Flour", "100g"], ["Salt", ""], ["Milk", "300ml"]]));
    assert.deepEqual(m.getIngredients(), ["Flour", "Salt", "Milk"]);
    assert.deepEqual(m.getMeasures(), ["100g", "", "300ml"]);
});

test("meal skips empty, whitespace and null ingredient slots", () => {
    const raw = rawMeal(1, "Toast", [["Bread", "2 slices"], [" ", " "], [null, null], ["Butter", "1 tbsp"]]);
    const m = new meal(raw);
    assert.deepEqual(m.getIngredients(), ["Bread", "Butter"]);
    assert.deepEqual(m.getMeasures(), ["2 slices", "1 tbsp"]);
});

test("hasIngredient is case-insensitive and matches partial names", () => {
    const m = new meal(rawMeal(1, "Cake", [["Plain Flour", "200g"], ["Eggs", "2"]]));
    assert.ok(m.hasIngredient("flour"));
    assert.ok(m.hasIngredient("EGG"));
    assert.ok(!m.hasIngredient("milk"));
});

test("findMeal returns an empty list when nothing matches", async () => {
    mockFetch({ "search.php": { meals: null } });
    assert.deepEqual(await findMeal("zzz"), []);
});

test("findID returns a meal object", async () => {
    mockFetch({ "lookup.php": { meals: [rawMeal(42, "Soup", [["Water", "1L"]])] } });
    const m = await findID(42);
    assert.equal(m.getName(), "Soup");
});

test("filterByIngre returns an empty list when no ingredient is given", async () => {
    assert.deepEqual(await filterByIngre(""), []);
});

test("filterByIngre returns an empty list when the API finds nothing", async () => {
    mockFetch({ "filter.php": { meals: null } });
    assert.deepEqual(await filterByIngre("unobtainium"), []);
});

test("filterByIngre narrows by extra ingredients regardless of case", async () => {
    const pancakes = rawMeal(1, "Pancakes", [["Flour", "100g"], ["Eggs", "2"], ["Milk", "300ml"]]);
    const bread = rawMeal(2, "Bread", [["Flour", "500g"], ["Yeast", "7g"]]);
    globalThis.fetch = async (url) => {
        let body;
        if (url.includes("filter.php")) {body = { meals: [{ idMeal: "1" }, { idMeal: "2" }] };}
        else if (url.includes("lookup.php?i=1")) {body = { meals: [pancakes] };}
        else if (url.includes("lookup.php?i=2")) {body = { meals: [bread] };}
        else {throw new Error(`Unexpected fetch: ${url}`);}
        return { ok: true, json: async () => body };
    };
    const result = await filterByIngre("flour", "EGG", "milk");
    assert.deepEqual(result.map((m) => m.getName()), ["Pancakes"]);
});

test("getSteps splits on new lines and STEP markers and drops numbering", () => {
    const m = new meal({ strInstructions: "STEP 1\r\nBoil water.\r\n\r\n2. Add pasta.\nstep 3 Drain it. step 4: Serve." });
    assert.deepEqual(m.getSteps(), ["Boil water.", "Add pasta.", "Drain it.", "Serve."]);
});

test("getSteps keeps leading quantities that are not step numbers", () => {
    const m = new meal({ strInstructions: "2 cups of flour go in first." });
    assert.deepEqual(m.getSteps(), ["2 cups of flour go in first."]);
});

test("getGuideVidEmbed turns a watch link into an embed link", () => {
    assert.equal(new meal({ strYoutube: "https://www.youtube.com/watch?v=abc123" }).getGuideVidEmbed(),
        "https://www.youtube-nocookie.com/embed/abc123");
    assert.equal(new meal({ strYoutube: "" }).getGuideVidEmbed(), null);
    assert.equal(new meal({ strYoutube: "not a url" }).getGuideVidEmbed(), null);
});

test("filterByCate and filterByArea return light meals without extra lookups", async () => {
    mockFetch({
        "filter.php?c=Seafood": { meals: [{ idMeal: "1", strMeal: "Fish pie", strMealThumb: "x.jpg" }] },
        "filter.php?a=British": { meals: null },
    });
    const seafood = await filterByCate("Seafood");
    assert.equal(seafood[0].getName(), "Fish pie");
    assert.deepEqual(seafood[0].getIngredients(), []);
    assert.deepEqual(await filterByArea("British"), []);
});

test("searchMeals keeps only meals found by every filter", async () => {
    mockFetch({
        "filter.php?c=Seafood": { meals: [{ idMeal: "1", strMeal: "Fish pie" }, { idMeal: "2", strMeal: "Paella" }] },
        "filter.php?a=British": { meals: [{ idMeal: "1", strMeal: "Fish pie" }, { idMeal: "3", strMeal: "Toad in the hole" }] },
    });
    const result = await searchMeals({ category: "Seafood", area: "British" });
    assert.deepEqual(result.map((m) => m.getName()), ["Fish pie"]);
    assert.equal(result[0].getCategory(), "Seafood");
    assert.equal(result[0].getArea(), "British");
});

test("searchMeals by name also applies category and ingredient filters", async () => {
    const pie = { ...rawMeal(1, "Fish pie", [["Cod", "300g"]]), strCategory: "Seafood", strArea: "British" };
    const cake = { ...rawMeal(2, "Fish cake", [["Salmon", "200g"]]), strCategory: "Seafood", strArea: "British" };
    mockFetch({ "search.php": { meals: [pie, cake] } });
    const result = await searchMeals({ name: "fish", category: "seafood", ingredients: ["cod"] });
    assert.deepEqual(result.map((m) => m.getName()), ["Fish pie"]);
});

test("searchMeals with no filters returns an empty list", async () => {
    assert.deepEqual(await searchMeals({}), []);
});

test("lookupAll never runs more than one batch at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = async (url) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        const id = new URL(url).searchParams.get("i");
        return { ok: true, json: async () => ({ meals: [rawMeal(id, `Meal ${id}`, [])] }) };
    };
    const ids = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const result = await lookupAll(ids, 8);
    assert.equal(result.length, 20);
    assert.ok(maxInFlight <= 8, `ran ${maxInFlight} requests at once`);
});

test("listACIClosure fetches the lists once and returns them by name", async () => {
    let calls = 0;
    globalThis.fetch = async (url) => {
        calls++;
        let body;
        if (url.includes("a=list")) {body = { meals: [{ strArea: "British" }] };}
        else if (url.includes("c=list")) {body = { meals: [{ strCategory: "Seafood" }] };}
        else {body = { meals: [{ strIngredient: "Cod" }] };}
        return { ok: true, json: async () => body };
    };
    const getList = await listACIClosure();
    await listACIClosure();
    assert.equal(calls, 3);
    assert.deepEqual(getList("area"), ["British"]);
    assert.deepEqual(getList("cate"), ["Seafood"]);
    assert.deepEqual(getList("ingre"), ["Cod"]);
    assert.equal(getList("lol"), null);
});
