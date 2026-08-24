let scenarios = [
    {
        id: 1,
        name: 'Завершить текущий вопрос',
        probability: 80,
        sort_priority: 1,
    }
]

let criterias = [
    {
        id: 1,
        name: 'Сказали полностью неверный ответ',
        unit: 'num|perc?|boolean'
    },
    {
        id: 2,
        name: 'Сказали неточность',
        unit: 'boolean'
    }
]

let trigger_table = [{
    scenario_id: 1,
    slide_windows: [
        {
            slide_window_size: 3,
            criterias: [
                {
                    criteria_id: 2,
                    strategy_calc_logic: 'count|avg|min|max',
                    strategy: 'gte|lte|gte|eq|neq|lt|gt',
                    value: 2, // true
                }
            ]
        }
    ]
}]

let hist = [{
    values: {
        1: 1,
        2: 0
    }
}]

function what_to_say ({lng = 'ru', scenario_id, hist, type= 'itnerview|graph_interview|nadiktovka'}) {
    return {
        msg: 'a',
        lng: 'ru'
    }
}

function scenario_action ({lng = 'ru', scenario_id, hist, type= 'itnerview|graph_interview|nadiktovka'}) {
    return what_to_say({})
}

let strategy_handler = {
    gte: ({value, real_value}) => value >= real_value,
    gt:  ({value, real_value}) => value > real_value,
}

function check_strategy({strategy, value, real_value}) {

    return strategy_handler[strategy]?.({value, real_value})
}

function criteria_probability(criteria_id) {
    return 100 * Math.random() > (criterias.find(it => it.criteria_id == criteria_id).probability || 100)

}


function get_action({hist}) {
    let map = {}


    for (let [{scenario_id, slide_windows}] of trigger_table) {
        for (let [{criterias, slide_window_size}, ind] of slide_windows) {
            for (let [{criteria_id, strategy, value}, ind] of criterias) {


                let real_value = 0;
                for (let i = 0; i < slide_window_size; i++) {
                    real_value += hist[i].values?.[criteria_id]
                }

                if (check_strategy({strategy, value, real_value}) && criteria_probability(criteria_id)) {
                    console.log("qqqqq CRITERIA MATCH",);
                    return {scenario_id, criteria_id}
                }

            }
        }
    }

    return def_screnario;

}