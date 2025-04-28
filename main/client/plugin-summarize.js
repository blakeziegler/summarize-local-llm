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
                    // Question prompt
                    prompt: { type: jspsych.ParameterType.HTML_STRING, default: undefined },
                    // placeholder response test
                    placeholder: { type: jspsych.ParameterType.STRING, default: "" },
                    // Rows
                    rows: { type: jspsych.ParameterType.INT, default: 1 },
                    // Cols
                    columns: { type: jspsych.ParameterType.INT, default: 40 },
                    // Response required boolean
                    required: { type: jspsych.ParameterType.BOOL, default: false },
                    
                    name: { type: jspsych.ParameterType.STRING, default: "" }
                }
            },
            // Randomize questions if true
            randomize_question_order: {
                type: jspsych.ParameterType.BOOL,
                default: false
            },
            // Display preamble (top of page)
            preamble: {
                type: jspsych.ParameterType.HTML_STRING,
                default: null
            },
            // Button label
            button_label: {
                type: jspsych.ParameterType.STRING,
                default: "Continue"
            },
            // Browser search auto-complete boolean
            autocomplete: {
                type: jspsych.ParameterType.BOOL,
                default: false
            }
        }
    };
  /**
   * **summarize-text** @author Ben Motz
   *  -- built largely from **survey-text** @author Josh de Leeuw
   *     @see {@link https://www.jspsych.org/plugins/jspsych-survey-text/ survey-text plugin documentation on jspsych.org}
   *  -- refactored to support external api: @author Blake Ziegler
   */
    class SummarizeTextPlugin {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }
        trial(display_element, trial) {
            for (let i = 0; i < trial.questions.length; i++) {
                if (typeof trial.questions[i].rows == "undefined") trial.questions[i].rows = 1;
                if (typeof trial.questions[i].columns == "undefined") trial.questions[i].columns = 40;
                if (typeof trial.questions[i].value == "undefined") trial.questions[i].value = "";
            }

            let html = "";
            // show preamble text
            if (trial.preamble !== null) {
                html += `<div id="jspsych-summarize-text-preamble" class="jspsych-summarize-text-preamble">${trial.preamble}</div>`;
            }

            // start form
            html += trial.autocomplete ? '<form id="jspsych-summarize-text-form">' :
                                         '<form id="jspsych-summarize-text-form" autocomplete="off">';
            
            // generate question order                                            
            let question_order = [];
            for (let i = 0; i < trial.questions.length; i++) {
                question_order.push(i);
            }
            if (trial.randomize_question_order) {
                question_order = this.jsPsych.randomization.shuffle(question_order);
            }

            // add questions

            for (let i = 0; i < trial.questions.length; i++) {
                const q = trial.questions[question_order[i]];
                const question_index = question_order[i];
                html += `<div id="jspsych-summarize-text-${question_index}" class="jspsych-summarize-text-question ${i==0?'unobfuscated':'obfuscated'}" style="margin: 2em 0em; max-width:800px; text-align:justify;">`;

                html += `<p class="jspsych-summarize-text">${q.prompt}</p>`;
                const autofocus = i == 0 ? "autofocus" : "";
                const req = q.required ? "required" : "";
                html += `<div id="input-container-${question_index}" class="input-container" style="width:100%; max-width:100%;">`;
                if (i == 0) {
                    html += `<textarea id="input-${question_index}" name="#jspsych-summarize-text-response-${question_index}" data-name="${q.name}" cols="${q.columns}" rows="${q.rows}" ${autofocus} ${req} placeholder="${q.placeholder}" onkeydown="if(event.keyCode==13&&!event.shiftKey){checkIt(${question_index});event.preventDefault();}" class="active"></textarea>`;
                    html += `<button type="button" id="submit-${question_index}" class="submit-btn" onClick="checkIt(${question_index});">Submit</button>`;
                } else {
                    html += `<textarea id="input-${question_index}" name="#jspsych-summarize-text-response-${question_index}" data-name="${q.name}" cols="${q.columns}" rows="${q.rows}" ${autofocus} ${req} placeholder="${q.placeholder}" onkeydown="if(event.keyCode==13&&!event.shiftKey){checkIt(${question_index});event.preventDefault();}" disabled="true"></textarea>`;
                    html += `<button type="button" id="submit-${question_index}" class="submit-btn" onClick="checkIt(${question_index});" disabled="true">Submit</button>`;
                }
                html += `</div>`;
                html += `<div id="response-${question_index}" class="summarize-response" style="margin-bottom:1em;">Explain the text in your own words</div>`;
                html += `<div id="api-result-${question_index}" class="api-result" style="margin-top:1em;white-space:pre-wrap;font-family:monospace;"></div>`;
                html += `</div>`;
            }

            html += `<input type="submit" id="jspsych-summarize-text-next" class="jspsych-btn jspsych-summarize-text" value="${trial.button_label}" disabled="true"></input><p></p>`;
            html += `</form>`;
            display_element.innerHTML = html;

            // focus first input
            display_element.querySelector("#input-0").focus();

            const startTime = performance.now();
            display_element.querySelector("#jspsych-summarize-text-form").addEventListener("submit", (e) => {
                e.preventDefault();
                var endTime = performance.now();
                var response_time = Math.round(endTime - startTime);
                var trialdata = {
                    rt: response_time,
                    response: question_data,
                };
                display_element.innerHTML = "";
                this.jsPsych.finishTrial(trialdata);
            });
        }
    }
    SummarizeTextPlugin.info = info;
    return SummarizeTextPlugin;
})(jsPsychModule);

var question_data = [];

// response logic
async function checkIt(q) {
    var thisq = q;
    var nextq = q+1;
    var response = document.getElementById("input-"+thisq).value;
    var rtime = performance.now();

    // Validation
    if (response.length < 10) {
        document.getElementById("response-"+thisq).innerHTML = "Please provide a longer response";
        document.getElementById("response-"+thisq).style.color="red";
        return;
    }
    if (response.trim().split(/\s+/).length < 4) {
        document.getElementById("response-"+thisq).innerHTML = "Please provide a longer response";
        document.getElementById("response-"+thisq).style.color="red";
        console.log(response);
        return;
    }

    // Valid response
    question_data.push({ name: document.getElementById("input-"+thisq).dataset.name, response: response });
    document.getElementById("response-"+thisq).innerHTML = "Your response has been recorded.";
    document.getElementById("response-"+thisq).style.color="green";
    document.getElementById("input-"+thisq).disabled = true;
    document.getElementById("submit-"+thisq).disabled = true;

    // call api, confirmation message
    document.getElementById("response-"+thisq).innerHTML = "Your response has been recorded. Evaluating...";
    let api_div = document.getElementById("api-result-"+thisq);

    try {
      const url = "https://chat.readerbench.com/score/summary";
      const headers = { "Content-Type": "application/json" };
      // set context, question and response
      const requestBody = {
        context: window.context_txt,
        question: window.question_txt,
        student_response: response
      };

      // api post request
      const api_response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(requestBody),
      });

      // throw error if response fails
      if (!api_response.ok) {
        throw new Error(`API Error: ${api_response.status}`);
      }

      // response -> json
      const json = await api_response.json();
      console.log("API Response:", json);

      // response formatting
      api_div.innerHTML = "<pre>" + JSON.stringify(json, null, 2) + "</pre>";
      api_div.style.color = "blue";
    } catch (error) {
      console.error(error);
      api_div.style.color = "red";
      api_div.innerHTML = "Error fetching API response. Please try again.";
    }

    // Move on to next question or end
    if (document.getElementById("jspsych-summarize-text-"+nextq) == null) {
      // Last question answered, enable the continue button
      document.getElementById("jspsych-summarize-text-next").disabled = false;
      document.getElementById("jspsych-summarize-text-next").focus();
    } else {
      // Enable next question
      document.getElementById("input-"+nextq).disabled = false;
      document.getElementById("submit-"+nextq).disabled = false;
      document.getElementById("input-"+nextq).classList.add('active');
      document.getElementById("jspsych-summarize-text-"+nextq).classList.remove('obfuscated');
      document.getElementById("jspsych-summarize-text-"+nextq).classList.add('unobfuscated');
      document.getElementById("input-"+thisq).classList.remove('active');
      document.getElementById("input-"+nextq).focus();
    }
}