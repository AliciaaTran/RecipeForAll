import { searchMeals, findID, randomMeal, listACIClosure } from "/src/utils.js";

const currentPage = window.location.pathname;

const infoLink = (id) => `/public/info.html?id=${encodeURIComponent(id)}`;

//build an element without innerHTML, so text from the API is never parsed as HTML
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

async function giveRandomMeal(event) {
  const button = event.currentTarget;
  const label = button.querySelector('.btn-label');
  const originalText = label.textContent;
  button.disabled = true;
  button.classList.add('busy');
  try {
    const theMeal = await randomMeal();
    window.location.href = infoLink(theMeal.getID());
  } catch (err) {
    button.disabled = false;
    button.classList.remove('busy');
    label.textContent = 'Try again';
    setTimeout(() => { label.textContent = originalText; }, 2500);
  }
}

/* ---------- home page ---------- */

//form field id -> URL parameter, so a search is still there after coming back from a recipe
const FIELDS = {
  userInput: 'q',
  categorySelect: 'cate',
  areaSelect: 'area',
  ingreFilter1: 'i1',
  ingreFilter2: 'i2',
  ingreFilter3: 'i3',
};

const getValue = (id) => document.getElementById(id).value.trim();

let searchToken = 0;

function readForm() {
  return {
    name: getValue('userInput'),
    category: getValue('categorySelect'),
    area: getValue('areaSelect'),
    ingredients: [getValue('ingreFilter1'), getValue('ingreFilter2'), getValue('ingreFilter3')].filter(Boolean),
  };
}

function saveFormToURL() {
  const params = new URLSearchParams();
  for (const [id, key] of Object.entries(FIELDS)) {
    if (getValue(id)) params.set(key, getValue(id));
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

function setStatus(text, isError = false) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.classList.toggle('error', isError);
}

function showEmptyState(title, text) {
  document.getElementById('output').replaceChildren(
    el('li', { class: 'empty-state' }, [el('strong', { text: title }), text]));
}

function resetResults() {
  searchToken++; //ignore any search still in flight
  document.getElementById('resultsTitle').textContent = 'Recipes';
  setStatus('');
  showEmptyState('What are we cooking today?', 'Search above, or pick a category to get started.');
}

//select a value even if the options failed to load
function setSelectValue(select, value) {
  if (value && ![...select.options].some((option) => option.value === value)) {
    select.append(el('option', { value, text: value }));
  }
  select.value = value;
}

function syncChips() {
  const current = getValue('categorySelect');
  for (const chip of document.querySelectorAll('#categoryChips .chip')) {
    const active = chip.dataset.value === current;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  }
}

function showSkeletons(count = 8) {
  const cards = Array.from({ length: count }, (_, i) =>
    el('li', { class: 'card skeleton', style: `--i:${i}`, 'aria-hidden': 'true' },
      el('div', {}, [
        el('div', { class: 'card-img' }),
        el('div', { class: 'card-body' }, [
          el('div', { class: 'skeleton-line' }),
          el('div', { class: 'skeleton-line short' }),
        ]),
      ])));
  document.getElementById('output').replaceChildren(...cards);
}

function mealCard(item, index) {
  const meta = [item.getCategory(), item.getArea()].filter(Boolean).join(' · ');
  return el('li', { class: 'card', style: `--i:${Math.min(index, 12)}` },
    el('a', { href: infoLink(item.getID()) }, [
      el('div', { class: 'card-img' },
        el('img', { src: item.getThumb(), alt: '', loading: 'lazy' })),
      el('div', { class: 'card-body' }, [
        el('h3', { text: item.getName() }),
        meta && el('p', { class: 'card-meta', text: meta }),
        el('p', { class: 'card-cta' }, ['View recipe ', el('span', { 'aria-hidden': 'true', text: '→' })]),
      ]),
    ]));
}

function describeQuery({ name, category, area, ingredients }) {
  if (name) return `Results for “${name}”`;
  if (category && !area && ingredients.length === 0) return `${category} recipes`;
  if (area && !category && ingredients.length === 0) return `${area} recipes`;
  return 'Matching recipes';
}

async function showMeal(event) {
  event?.preventDefault();
  const query = readForm();
  saveFormToURL();
  syncChips();

  if (!query.name && !query.category && !query.area && query.ingredients.length === 0) {
    resetResults();
    setStatus('Please enter a food name, pick a category or cuisine, or add an ingredient.', true);
    return;
  }

  const token = ++searchToken;
  document.getElementById('resultsTitle').textContent = describeQuery(query);
  setStatus('Searching...');
  showSkeletons();

  const results = document.getElementById('results');
  if (results.getBoundingClientRect().top > window.innerHeight * 0.6) {
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let mealsList;
  try {
    mealsList = await searchMeals(query);
  } catch (err) {
    if (token !== searchToken) return;
    setStatus('');
    showEmptyState('The kitchen is a little busy', 'The recipe service did not answer. Please wait a moment and try again.');
    return;
  }
  if (token !== searchToken) return; //a newer search has started

  if (mealsList.length === 0) {
    setStatus('');
    showEmptyState('No meals found', 'Try fewer filters, or check the spelling.');
    return;
  }
  setStatus(`${mealsList.length} recipe${mealsList.length === 1 ? '' : 's'} found`);
  document.getElementById('output').replaceChildren(...mealsList.map(mealCard));
}

function pickCategory(cate) {
  const wasActive = getValue('categorySelect') === cate;
  for (const id of Object.keys(FIELDS)) document.getElementById(id).value = '';
  if (wasActive) {
    //clicking the active chip again turns it off
    saveFormToURL();
    syncChips();
    resetResults();
    return;
  }
  setSelectValue(document.getElementById('categorySelect'), cate);
  showMeal();
}

async function loadFilterOptions() {
  const chips = document.getElementById('categoryChips');
  let getList;
  try {
    getList = await listACIClosure();
  } catch (err) {
    chips.replaceChildren(el('p', { class: 'status', text: "Categories couldn't be loaded right now, but searching still works." }));
    return;
  }

  const categorySelect = document.getElementById('categorySelect');
  const areaSelect = document.getElementById('areaSelect');
  categorySelect.append(...getList('cate').map((cate) => el('option', { value: cate, text: cate })));
  areaSelect.append(...getList('area').map((area) => el('option', { value: area, text: area })));
  document.getElementById('ingredientOptions')
    .append(...getList('ingre').map((ingre) => el('option', { value: ingre })));

  chips.replaceChildren(...getList('cate').map((cate, i) =>
    el('button', {
      type: 'button',
      class: 'chip',
      style: `--i:${i}`,
      'data-value': cate,
      'aria-pressed': 'false',
      text: cate,
      onclick: () => pickCategory(cate),
    })));
}

async function initHome() {
  const form = document.getElementById('searchForm');
  form.addEventListener('submit', showMeal);
  form.addEventListener('reset', () => {
    //wait for the browser to clear the fields first
    setTimeout(() => {
      saveFormToURL();
      syncChips();
      resetResults();
    });
  });
  document.getElementById('categorySelect').addEventListener('change', syncChips);
  document.getElementById('randomFood').addEventListener('click', giveRandomMeal);

  resetResults();
  await loadFilterOptions();

  //restore the last search from the URL
  const params = new URLSearchParams(window.location.search);
  let hasSearch = false;
  for (const [id, key] of Object.entries(FIELDS)) {
    const value = params.get(key) ?? '';
    const field = document.getElementById(id);
    if (field.tagName === 'SELECT') setSelectValue(field, value);
    else field.value = value;
    if (value) hasSearch = true;
  }
  syncChips();
  if (hasSearch) showMeal();
}

/* ---------- recipe page ---------- */

function showDetailError(text, canRetry) {
  document.getElementById('loader').hidden = true;
  document.getElementById('recipe').hidden = true;
  document.getElementById('errorBox').hidden = false;
  document.getElementById('errorText').textContent = text;
  document.getElementById('retryBtn').hidden = !canRetry;
}

function toggleStep(event) {
  const step = event.currentTarget;
  step.setAttribute('aria-pressed', String(step.getAttribute('aria-pressed') !== 'true'));
}

function setBadge(id, value) {
  const badge = document.getElementById(id);
  badge.textContent = value ?? '';
  badge.hidden = !value;
}

async function displayMeal() {
    document.getElementById('loader').hidden = false;
    document.getElementById('errorBox').hidden = true;
    document.getElementById('recipe').hidden = true;

    const params = new URLSearchParams(window.location.search);
    const mealID = params.get('id');
    if (!mealID) {
      showDetailError('No recipe was selected.', false);
      return;
    }

    let meal;
    try {
      meal = await findID(mealID);
    } catch (err) {
      showDetailError("We couldn't reach the recipe service. Please wait a moment and try again.", true);
      return;
    }
    if (!meal || Array.isArray(meal)) {
      showDetailError("We couldn't find this recipe.", false);
      return;
    }

    document.title = `${meal.getName()} · RecipeForAll`;
    document.getElementById('foodName').textContent = meal.getName();

    const img = document.getElementById("img1");
    img.classList.remove('loaded');
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    img.alt = meal.getName();
    img.src = meal.getThumb();

    setBadge('category', meal.getCategory());
    setBadge('area', meal.getArea());

    const tags = (meal.getTagsList() ?? []).map((tag) => tag.trim()).filter(Boolean);
    document.getElementById('tags').replaceChildren(...tags.map((tag) => el('span', { class: 'tag', text: tag })));

    const ingrelist = meal.getIngredients();
    const meaulist = meal.getMeasures();
    document.getElementById("ingre:measure").replaceChildren(...ingrelist.map((ingre, i) =>
      el('li', {}, el('label', {}, [
        el('input', { type: 'checkbox' }),
        el('span', { class: 'ingredient-name', text: ingre }),
        el('span', { class: 'ingredient-measure', text: meaulist[i] }),
      ]))));

    const steps = meal.getSteps();
    document.getElementById("instructions").replaceChildren(...steps.map((step) =>
      el('li', {}, el('button', { type: 'button', class: 'step', 'aria-pressed': 'false', onclick: toggleStep },
        el('span', { text: step })))));

    document.getElementById('stats').textContent =
      `${ingrelist.length} ingredient${ingrelist.length === 1 ? '' : 's'} · ${steps.length} step${steps.length === 1 ? '' : 's'}`;

    const embed = meal.getGuideVidEmbed();
    document.getElementById('video').hidden = !embed;
    document.getElementById('videoLink').hidden = !embed;
    document.getElementById('videoFrame').replaceChildren(embed ? el('iframe', {
      src: embed,
      title: `How to make ${meal.getName()}`,
      loading: 'lazy',
      allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    }) : '');

    document.getElementById('loader').hidden = true;
    document.getElementById('recipe').hidden = false;
}

function initInfo() {
  document.getElementById('retryBtn').addEventListener('click', displayMeal);
  document.getElementById('randomFood').addEventListener('click', giveRandomMeal);

  //go back in history when we came from the search page, so its results are kept
  document.getElementById('backLink').addEventListener('click', (event) => {
    try {
      if (document.referrer && new URL(document.referrer).pathname.endsWith('/web.html')) {
        event.preventDefault();
        history.back();
      }
    } catch { /* bad referrer, just follow the link */ }
  });

  displayMeal();
}

if(currentPage.includes(`info.html`)){
    initInfo();
} else {
    initHome();
}
