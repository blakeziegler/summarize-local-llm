// plugin-summarize.js

// API endpoint for summary scoring (update as needed)

var jsPsychSummarizeText = (function (jspsych) {
    'use strict';

    const info = {
        name: "summarize-text",
        parameters: {
            questions: {
                type: jspsych.ParameterType.COMPLEX,
                array: true,
                default: undefined,
                nested: {
                    prompt:      { type: jspsych.ParameterType.HTML_STRING, default: undefined },
                    placeholder: { type: jspsych.ParameterType.STRING,      default: "" },
                    rows:        { type: jspsych.ParameterType.INT,         default: 1 },
                    columns:     { type: jspsych.ParameterType.INT,         default: 40 },
                    required:    { type: jspsych.ParameterType.BOOL,        default: false },
                    name:        { type: jspsych.ParameterType.STRING,      default: "" }
                }
            },
            randomize_question_order: { type: jspsych.ParameterType.BOOL, default: false },
            preamble:                 { type: jspsych.ParameterType.HTML_STRING, default: null },
            button_label:             { type: jspsych.ParameterType.STRING,      default: "Continue" },
            autocomplete:             { type: jspsych.ParameterType.BOOL,        default: false }
        }
    };

    class SummarizeTextPlugin {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }

        trial(display_element, trial) {
            // initialize defaults
            for (let i = 0; i < trial.questions.length; i++) {
                trial.questions[i].rows    ||= 1;
                trial.questions[i].columns ||= 40;
                trial.questions[i].value   ||= "";
            }

            // build form HTML
            let html = "";
            if (trial.preamble !== null) {
                html += `<div class="jspsych-summarize-text-preamble">${trial.preamble}</div>`;
            }
            html += trial.autocomplete
                ? `<form id="jspsych-summarize-text-form">`
                : `<form id="jspsych-summarize-text-form" autocomplete="off">`;

            // question order
            let order = trial.questions.map((_, i) => i);
            if (trial.randomize_question_order) {
                order = this.jsPsych.randomization.shuffle(order);
            }

            // add each question
            order.forEach((qidx, i) => {
                const q = trial.questions[qidx];
                const isFirst = i === 0;
                html += `
                  <div id="jspsych-summarize-text-${qidx}"
                       class="jspsych-summarize-text-question ${isFirst ? 'unobfuscated' : 'obfuscated'}"
                       style="margin:2em 0; max-width:800px; text-align:justify;">
                    <p>${q.prompt}</p>
                    <div class="input-container" style="width:100%; max-width:100%;">
                      <textarea
                        id="input-${qidx}"
                        data-name="${q.name}"
                        cols="${q.columns}"
                        rows="${q.rows}"
                        ${isFirst ? 'autofocus' : ''}
                        ${q.required ? 'required' : ''}
                        placeholder="${q.placeholder}"
                        ${isFirst ? '' : 'disabled'}
                        onkeydown="if(event.keyCode===13&&!event.shiftKey){ checkIt(${qidx}); event.preventDefault(); }"
                        class="${isFirst ? 'active' : ''}"
                      ></textarea>
                      <button
                        type="button"
                        id="submit-${qidx}"
                        class="submit-btn"
                        onclick="checkIt(${qidx})"
                        ${isFirst ? '' : 'disabled'}
                      >Submit</button>
                    </div>
                    <div id="response-${qidx}" class="summarize-response" style="margin-bottom:1em;">
                      Explain the text in your own words
                    </div>
                    <div id="api-result-${qidx}" class="api-result" style="margin-top:1em; white-space:pre-wrap; font-family:monospace;"></div>
                  </div>`;
            });

            html += `<input type="submit" id="jspsych-summarize-text-next" class="jspsych-btn" value="${trial.button_label}" disabled></input></form>`;
            display_element.innerHTML = html;

            // focus first field and bind submit
            display_element.querySelector("#input-0").focus();
            const startTime = performance.now();
            display_element.querySelector("#jspsych-summarize-text-form")
                .addEventListener("submit", e => {
                    e.preventDefault();
                    const rt = Math.round(performance.now() - startTime);
                    this.jsPsych.finishTrial({
                        rt,
                        response: question_data
                    });
                });
        }
    }
    SummarizeTextPlugin.info = info;
    return SummarizeTextPlugin;
})(jsPsychModule);

var question_data = [];

/**
 * Called when the user submits each question.
 * Validates, records, calls the API, then advances.
 */
async function checkIt(q) {
    const response = document.getElementById(`input-${q}`).value.trim();

    // basic length validation
    if (response.length < 10 || response.split(/\s+/).length < 4) {
        const respDiv = document.getElementById(`response-${q}`);
        respDiv.textContent = "Please provide a longer response";
        respDiv.style.color = "red";
        return;
    }

    // record the response
    question_data.push({
        name: document.getElementById(`input-${q}`).dataset.name,
        response
    });
    const respDiv = document.getElementById(`response-${q}`);
    respDiv.textContent = "Your response has been recorded. Evaluating...";
    respDiv.style.color = "green";

    // disable current inputs
    document.getElementById(`input-${q}`).disabled = true;
    document.getElementById(`submit-${q}`).disabled = true;

    // call the local scoring API
    const apiDiv = document.getElementById(`api-result-${q}`);
    try {
        const res = await fetch(SUMMARY_API_URL ||  "http://localhost:8000/score/summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                context: window.context_txt,
                question: window.question_txt,
                student_response: response
            })
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const json = await res.json();
        apiDiv.innerHTML = `<pre>${JSON.stringify(json, null, 2)}</pre>`;
        apiDiv.style.color = "blue";
    } catch (err) {
        apiDiv.textContent = "Error fetching API response. Please try again.";
        apiDiv.style.color = "red";
        console.error(err);
    }

    // move on
    const next = document.getElementById(`jspsych-summarize-text-${q + 1}`);
    if (next) {
        // enable next
        document.getElementById(`input-${q + 1}`).disabled = false;
        document.getElementById(`submit-${q + 1}`).disabled = false;
        next.classList.remove('obfuscated');
        next.classList.add('unobfuscated');
        document.getElementById(`input-${q + 1}`).focus();
    } else {
        // last question → enable continue
        document.getElementById("jspsych-summarize-text-next").disabled = false;
        document.getElementById("jspsych-summarize-text-next").focus();
    }
}