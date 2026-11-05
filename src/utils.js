export class meal{
    constructor(mealObj) {

        this.ID = mealObj.idMeal;
        this.name = mealObj.strMeal;
        this.category = mealObj.strCategory;
        this.area= mealObj.strArea;
        this.thumbnail = mealObj.strMealThumb;
        this.guideVideo = mealObj.strYoutube;
        this.instructions = mealObj.strInstructions;

        this.tags = mealObj.strTags
            ? mealObj.strTags.toLowerCase().split(",")
            : null;

        //read strIngredientN and strMeasureN together so the two lists stay aligned
        this.ingredients = [];
        this.measures = [];
        for(let i = 1; `strIngredient${i}` in mealObj; i++) {
            const ingredient = (mealObj[`strIngredient${i}`] ?? "").trim();
            if (ingredient === "") {continue;}
            this.ingredients.push(ingredient);
            this.measures.push((mealObj[`strMeasure${i}`] ?? "").trim());
        }
    }
    //case-insensitive, partial match: "flour" matches "Plain Flour"
    hasIngredient(name) {
        const target = name.trim().toLowerCase();
        return this.ingredients.some((ingre) => ingre.toLowerCase().includes(target));
    }
    getName() {
        return this.name;
    }
    getID() {
        return this.ID;
    }
    getCategory() {
        return this.category;
    }
    getArea() {
        return this.area;
    }
    getThumb() {
        return this.thumbnail;
    }
    getGuideVid() {
        return this.guideVideo;
    }
    //turn the YouTube watch link into an embeddable one, null if there is no video
    getGuideVidEmbed() {
        if (!this.guideVideo) {return null;}
        try {
            const videoID = new URL(this.guideVideo).searchParams.get("v");
            return videoID ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoID)}` : null;
        } catch {
            return null;
        }
    }
    getInstructions() {
        return this.instructions;
    }
    //split the instructions into steps, dropping "STEP 1" headings and "1." style numbering
    getSteps() {
        if (!this.instructions) {return [];}
        return this.instructions
            .split(/\r?\n+|(?=\bstep\s*\d+\b)/i)
            .map((line) => line.trim())
            .filter((line) => !/^(step\s*)?\d+[:.)]?$/i.test(line))
            .map((line) => line.replace(/^(step\s*\d+\s*[:.)-]?|\d+[.)])\s+/i, ""))
            .filter((line) => line !== "");
    }
    getTagsList() {
        return this.tags;
    }
    getIngredients() {
        return this.ingredients;
    }
    getMeasures() {
        return this.measures;
    }



}

//return a "meal" object 
export function findID(id = null) {
    if (id===null) {return Promise.reject("No id inputted")}
    return fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => {
        if (val.meals===null) {
            return [];
        } else {
            return new meal(val.meals[0]);
        }
    })
    .catch(reason => Promise.reject(reason))
}

//return a list of "meal" object
export function findMeal(name = null) {
    if (name===null) {return Promise.reject("No name inputted")}
    return fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${name}`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => {
        if (val.meals===null) {
            return [];
        } else {
            return val.meals.map((e)=> {return new meal(e);});
        }
    })
    .catch(reason => Promise.reject(reason))
}

//return a "meal" object
export function randomMeal() {
    return fetch(`https://www.themealdb.com/api/json/v1/1/random.php`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => {
        return new meal(val.meals[0]);
    })
    .catch(reason => Promise.reject(reason))
}

function getAreaOnce() {
    return fetch(`https://www.themealdb.com/api/json/v1/1/list.php?a=list`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => {
        return val.meals.map((e)=>e.strArea)
    })
    .catch(reason => Promise.reject(reason))
}

function getCategoryOnce() {
    return fetch(`https://www.themealdb.com/api/json/v1/1/list.php?c=list`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => {
        return val.meals.map((e)=>e.strCategory)
    })
    .catch(reason => Promise.reject(reason))
}

function getIngredientOnce() {
    return fetch(`https://www.themealdb.com/api/json/v1/1/list.php?i=list`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => {
        return val.meals.map((e)=>e.strIngredient)
    })
    .catch(reason => Promise.reject(reason))
}

//return a closure that return a list of string depending on the closure input
//the three lists are fetched once and shared by every caller
let aciPromise = null;
export function listACIClosure() {
    if (aciPromise === null) {
        aciPromise = Promise.all([getAreaOnce(), getCategoryOnce(), getIngredientOnce()])
        .then(([areaList, cateList, ingreList]) => {
            return (name)=> {
                switch (name) {
                    case "area":
                        return areaList;
                    case "cate":
                        return cateList;
                    case "ingre":
                        return ingreList;
                    default:
                        return null;
                }
            }
        })
        .catch(reason => {
            aciPromise = null; //allow a retry after a failed request
            return Promise.reject(reason);
        });
    }
    return aciPromise;
}

//look up full details for many ids, a few at a time so TheMealDB does not rate-limit us
//return a list of "meal" object
export async function lookupAll(ids, batchSize = 8) {
    const result = [];
    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        result.push(...await Promise.all(batch.map((id) => findID(id))));
    }
    return result.filter((foodObj) => foodObj instanceof meal);
}

//return a list of "meal" object with only id, name and thumbnail filled in (use findID for the rest)
function filterBy(type, name) {
    return fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?${type}=${encodeURIComponent(name)}`)
    .then(val => {
        if(val.ok) {return val.json();}
        else {return Promise.reject("API request not ok, try again")}
    })
    .then(val => (val.meals ?? []).map((e) => new meal(e)))
    .catch(reason => Promise.reject(reason))
}

//return a list of "meal" object (id, name and thumbnail only)
function filterByFirstIngre(name) {
    return filterBy("i", name.trim().replace(/\s+/g, "_"));
}

//return a list of "meal" object (id, name and thumbnail only)
export function filterByCate(name) {
    return filterBy("c", name.trim());
}

//return a list of "meal" object (id, name and thumbnail only)
export function filterByArea(name) {
    return filterBy("a", name.trim());
}

//search with any mix of name, category, area and ingredients
//return a list of "meal" object
export async function searchMeals({ name = "", category = "", area = "", ingredients = [] } = {}) {
    name = name.trim();
    category = category.trim();
    area = area.trim();
    ingredients = ingredients.map((ingre) => ingre.trim()).filter(Boolean);
    const sameText = (a, b) => (a ?? "").toLowerCase() === b.toLowerCase();

    //a name search returns full details, so every other filter can be checked locally
    if (name) {
        const found = await findMeal(name);
        return found.filter((foodObj) =>
            (!category || sameText(foodObj.getCategory(), category)) &&
            (!area || sameText(foodObj.getArea(), area)) &&
            ingredients.every((ingre) => foodObj.hasIngredient(ingre)));
    }

    //otherwise ask the API once per filter and keep the meals found in every list
    const requests = [];
    if (category) {requests.push(filterByCate(category));}
    if (area) {requests.push(filterByArea(area));}
    if (ingredients.length > 0) {requests.push(filterByFirstIngre(ingredients[0]));}
    if (requests.length === 0) {return [];}

    const [first, ...others] = await Promise.all(requests);
    const otherIDs = others.map((list) => new Set(list.map((foodObj) => foodObj.getID())));
    let filterResult = first.filter((foodObj) => otherIDs.every((ids) => ids.has(foodObj.getID())));

    //the API can only filter by one ingredient, so check the rest against the full details
    const extraIngredients = ingredients.slice(1);
    if (extraIngredients.length > 0) {
        const fullMeals = await lookupAll(filterResult.map((foodObj) => foodObj.getID()));
        return fullMeals.filter((foodObj) => extraIngredients.every((ingre) => foodObj.hasIngredient(ingre)));
    }

    //the filter lists leave these out, but we already know them
    for (const foodObj of filterResult) {
        if (category && !foodObj.category) {foodObj.category = category;}
        if (area && !foodObj.area) {foodObj.area = area;}
    }
    return filterResult;
}

//return a list of "meal" object
export function filterByIngre(name1 = '', name2 = '', name3 = '') {
    return searchMeals({ ingredients: [name1, name2, name3] });
}
