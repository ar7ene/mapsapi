FirmCard.Schedule = function(options) {
    var options = options || {};

    this.localLang = options.localLang || 'ru';
    this.localWorkingDays = options.localWorkingDays || [0, 1, 1, 1, 1, 1, 0];
    this.firstdayOffset = options.firstdayOffset || 1;
    this.minHoursToDisplayClosure = options.minHoursToDisplayClosure || 4;

    return this;
}

FirmCard.Schedule.prototype = {

    transform: function (model, params) {

        if (!model) return;

        var todayKey, // Mon, Tue ...
            today, // Объект модели - текущий день недели
            from, // Самое раннее время открытия за день
            to, // Самое позднее время закрытия за день
            schedule = {}, // Объект-расписание, формируемый под шаблон
            apiHourFormat = 'HH:mm', // Формат времени в API, например 08:01
            now = (params || {}).now || moment().valueOf(), // Current timestamp in milliseconds
            weekKeys = [], // Ключи дней недели, определяют порядок дней и первый день недели. 0 - первый день недели в регионе (не обязательно Mon)
            weekKeysLocal = [],
            weekFullKeysLocal = [],
            orgWorkginDays, // Рабочие дни данной организации
            apiLang = 'en',
            localLang = this.localLang,
            localWorkingDays = this.localWorkingDays, // Рабочие дни в данной стране
            firstdayOffset = this.firstdayOffset, // 0-6 // Смещение начала недели относительно воскресенья (воскресенье взято первым днём по-умолчанию, потому что такой формат у moment.js)
            minHoursToDisplayClosure = this.minHoursToDisplayClosure; // Число часов, меньше которого появляется строка "закроется через 2 часа..."

        function getHours(str) {
            return str.substr(0, 2);
        }

        function getMinutes(str) {
            return str.substr(3, 2);
        }

        // Конвертация временной точки формата апи в формат отображения (25:00 -> 01:00)
        function formatTime(str) {
            var hours = +getHours(str) % 24 + '';

            if (hours.length == 1) hours = '0' + hours;

            return hours + ':' + getMinutes(str);
        }

        // Конвертация int числа в номер дня недели (диапазон 0-6)
        function dayNum(n) {
            return (n + 70) % 7;
        }

        // Преобразовать расписание на день в упорядоченный массив временных отсечек (string)
        // Сейчас полагается, что API уже выдаёт сортированный массив
        function getSortedTimePoints(day) {
            var points = [],
                from, to,
                deltaHours, deltaMinutes;

            if (!day || !day.working_hours) {
                return [];
            }

            for (var i = 0; i < day.working_hours.length; i++) {
                from = day.working_hours[i].from;
                to = day.working_hours[i].to;

                deltaHours = getHours(to) - getHours(from);
                deltaMinutes = getMinutes(to) - getMinutes(from);
                if (deltaHours < 0 || (deltaHours == 0 && deltaMinutes <= 0)) { // Если "до" меньше или равно "от" - значит указывает на завтра
                    to = (+getHours(to) + 24) + ':' + getMinutes(to); // (01:00 -> 25:00)
                }

                points[i * 2] = from;
                points[i * 2 + 1] = to;
            }

            return points;
        }

        // Возвращает массив timestamp всех точек, всех дней недели, от сегодняшнего и в будущее
        // Например, сегодня среда, отсечки будут взяты для дат со среды (сегодня) по следующий вторник включительно
        function getTimeStamps(model) {
            var timestamps = [],
                out = [],
                timePoints,
                num = _.indexOf(weekKeys, todayKey); // Номер сегодняшнего дня недели (для данного региона)

            // Цикл по дням недели начиная с сегодняшнего
            var j; // Номер текущего дня в массиве weekKeys
            for (var i = 0; i < 0 + 7; i++) {
                j = dayNum(num + i);
                timePoints = getSortedTimePoints(model[weekKeys[j]]);
                // Цикл по точкам времени с конвертацией в timestamp
                _.each(timePoints, function(point, k) {
                    // now - обязательно! иначе будет браться текущий timestamp что чревато несовпадениями при медленном быстродействии
                    var ts = moment(now).day(dayNum(num + i + firstdayOffset)).hours(getHours(timePoints[k])).minutes(getMinutes(timePoints[k])).valueOf(); // Вычислить таймстемп для данного дня недели, часа и минуты, в будущем, но ближайший к now
                    timestamps.push(ts);

                    // Парно удаляем совпадающие точки (они не имеют смысла - это сегодня 24:00 и завтра 00:00)
                    if (timestamps[timestamps.length - 1] == timestamps[timestamps.length - 2]) {
                        timestamps.pop();
                        timestamps.pop();
                    }

                    // Парно переносим точки в будущее, если они обе в прошлом (первая точка ([0]) должна быть всегда открытием!)
                    if (timestamps.length > 1 && timestamps[timestamps.length - 1] <= now && timestamps[timestamps.length - 2] <= now) {
                        timestamps[timestamps.length - 1] += (7 * 24 * 60 * 60 * 1000);
                        timestamps[timestamps.length - 2] += (7 * 24 * 60 * 60 * 1000);
                    }
                });
            }

            timestamps.sort(); // Сортируем на возрастание, ведь возможно были переносы в будущее

            // Удаляем попарно совпадающие точки времени
            i = 0;
            while (i < timestamps.length) {
                if (timestamps[i] === timestamps[i + 1]) {
                    i++;
                } else {
                    out.push(timestamps[i]);
                }
                i++;
            }

            // Проверка на ежедневно-круглосуточность
            if (out.length == 2 && (out[1] - out[0]) == (7 * 24 * 60 * 60 * 1000)) {
                return [];
            }

            return timestamps;
        }

        function whenOpenInverse(h, d, num) {
            if (d == 1 && h > minHoursToDisplayClosure) {
                return FirmCard.Schedule.dictionary.t(localLang, 'tommorow');
            } else if (d == 2) {
                return FirmCard.Schedule.dictionary.t(localLang, 'afterTommorow');
            } else if (d >= 7) {
                return FirmCard.Schedule.dictionary.t(localLang, 'afterWeek');
            } else if (d > 2) { // вО вторник
                /* jshint -W015 */
                switch (num) {
                    case 0:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextSun');
                    case 1:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextMon');
                    case 2:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextTue');
                    case 3:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextWed');
                    case 4:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextThu');
                    case 5:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextFri');
                    case 6:
                        return FirmCard.Schedule.dictionary.t(localLang, 'nextSat');
                }
                /* jshint +W015 */
            }

            return;
        }

        // Поместить данные в объект для шаблона о сегодняшнем дне
        function setTodayString(today) {
            var timePoints,
            periods = [],
                periodStart, // Timestamp времени открытия сегодня
                periodEnd, //Timestamp времени закрытия сегодня
                timestamps;

            schedule.now = {};

            // Timestamps всех отсечек
            timestamps = getTimeStamps(model);

            if (!timestamps.length) {
                schedule.always = true; // Работает ежедневно круглосуточно
                schedule.now.open = true;
            }

            for (var i = 0; i < timestamps.length; i++) {
                // Попали между точками i-1 и i // Мы находимся заведомо в будущем относительно 1
                if (now >= (timestamps[i - 1] || 0) && now < timestamps[i]) {
                    var h = Math.floor((timestamps[i] - now) / (1000 * 60 * 60)), // Количество часов до следующего timestamp
                        m = Math.floor((timestamps[i] - now) / (1000 * 60) - h * 60), // Количество минут (без часов) до следующего timestamp
                        d = moment(timestamps[i]).dayOfYear() - moment(now).dayOfYear(),
                        nowIsOpen = (i % 2 != 0);

                    schedule.now.open = nowIsOpen;

                    schedule.will = {
                        text: FirmCard.Schedule.dictionary.t(localLang, 'willOpen'), // Оптимистичный прогноз :)
                        d: d,
                        h: h,
                        m: m
                    };

                    if (nowIsOpen) {
                        schedule.will.text = FirmCard.Schedule.dictionary.t(localLang, 'willClose');
                    }

                    schedule.will.when = whenOpenInverse(h, d, moment(timestamps[i]).day()); // Когда закроется или откроется

                    schedule.will.till = moment(timestamps[i]).format(apiHourFormat);
                }
            }

            if (!today) {
                return; // На сегодня расписания нет - сейчас закрыто
            }

            timePoints = getSortedTimePoints(today);

            // Цикл по периодам работы за день
            for (i = 2; i < timePoints.length; i = i + 2) {
                periods.push({
                    from: timePoints[i - 1],
                    to: timePoints[i]
                });
            }

            from = formatTime(timePoints[0]);
            to = formatTime(timePoints[timePoints.length - 1]);

            if (from == to) { // Круглосуточно
                schedule.today = {
                    alltime: true
                };
            } else { // От from до to
                schedule.today = {
                    from: from,
                    to: to
                };
            }

            if (periods.length > 0) { // Перерывы на обед
                schedule.lunch = {
                    periods: periods
                };
            }
        }

        // Формирование объекта-таблицы-расписания для шаблона
        function makeTable() {
            var column = [],
                hasLunch = false;

            for (var j = 0; j < 7; j++) {
                var dayKey = weekKeys[j],
                    lunchMaxLength = 0;

                column[j] = {};

                if (model[dayKey]) {
                    var day = model[dayKey],
                        timePoints = getSortedTimePoints(day),
                        lunch = []; // Отрезки времени (отсортированные моменты) на обеды

                    // Цикл по периодам работы за день
                    for (var i = 2; i < timePoints.length; i = i + 2) {
                        hasLunch = true;
                        lunch.push({
                            from: timePoints[i - 1],
                            to: timePoints[i]
                        });
                    }
                    lunchMaxLength = Math.max(timePoints.length / 2, lunchMaxLength);

                    column[j] = {
                        from: formatTime(timePoints[0]),
                        to: formatTime(timePoints[timePoints.length - 1]),
                        lunch: lunch
                    };
                }

                if (dayKey === todayKey) { // Сегодняшний день надо подсветить
                    column[j].active = true;
                }

                column[j].key = weekKeysLocal[j];
            }

            // Дополнение пустыми объектами массивов lunch
            _.each(column, function(col) {
                if (col.lunch) {
                    _.defaults(col.lunch, _.range(1, lunchMaxLength));
                }
            });

            return {
                table: column,
                hasLunch: hasLunch
            };
        }

        // Сгенерировать строку для всех дней model, совпадающих с day
        function makeSimpleString(day, model) {
            var points,
            out = {
                dayList: []
            },
            work = [];

            if (day && day.working_hours && day.working_hours.length) {
                points = getSortedTimePoints(day);
                out.from = formatTime(points[0]);
                out.to = formatTime(_.last(points));
                if (day.round_the_clock) {
                    out.alltime = true;
                }
            } else { // Выходной
                out.holiday = true;
            }

            // Формируем список дней на локальном языке
            var groupWorkingDays = [0, 0, 0, 0, 0, 0, 0]; // Флаги работы фирмы в дни текущей группы
            var flow = 0;

            _.each(weekKeys, function(dayKey, numKey) { // 'Mon', 0
                if (_.isEqual(model[dayKey], day) || (!model[dayKey] && day === null)) {
                    out.dayList.push(weekFullKeysLocal[numKey]);
                    groupWorkingDays[dayNum(numKey + firstdayOffset)] = 1;
                    flow++;
                } else {
                    if (flow > 2) { // Более 2 дней подряд
                        var lastDay = out.dayList.pop();

                        for (var i = 1; i < flow - 1; i++) {
                            out.dayList.pop();
                        }

                        out.dayList[out.dayList.length - 1] += '–' + lastDay;
                    }

                    flow = 0;
                }
            });

            // Список дней в данной группе идентичен списку будних дней, значит можно заменить словом "Будни"
            out.budni = _.isEqual(localWorkingDays, groupWorkingDays);

            // Список рабочих дней - все дни недели, значит нужно выводить фразу "Ежедневно"
            out.everyday = (_.min(groupWorkingDays) == 1);

            // Делаем из массива строку и поднимаем первый символ
            out.dayList = out.dayList.join(', ');
            out.dayList = out.dayList.charAt(0).toUpperCase() + out.dayList.slice(1);

            return out;
        }

        // Возвращает массив simple строк на основе массива дней days
        function makeAdvancedString(days, model) {
            var out = [];

            for (var i = days.length - 1; i >= 0; i--) {
                out.push(makeSimpleString(days[i], model));
            }

            return out;
        }

        // Заполняем названия дней недели, 1 - понедельник. В заполненных массивах понедельник это 0
        for (var i = 0; i < 7; i++) {
            moment.lang(apiLang);
            weekKeys[i] = moment(now).day(i + firstdayOffset).format('ddd'); // [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ]
            moment.lang(localLang);
            weekKeysLocal[i] = moment(now).day(i + firstdayOffset).format('ddd');
            weekFullKeysLocal[i] = moment(now).day(i + firstdayOffset).format('dddd');
        }

        // Вычисляем сегодняшний день недели (ссылку на объект дня в модели)
        moment.lang(apiLang);
        todayKey = moment(now).format('ddd');
        today = model[todayKey]; // Объект расписания - текущий день недели
        moment.lang(localLang);
        setTodayString(today); // Сделать объект для шаблона - строка, которая описывает время работы сегодня

        // Находим количество разных расписаний и сохраняем их в массив
        var apiDifferentDays = [], // Массив различающихся дней из модели
            apiScheduleDaysCount = 0, // Количество описанных дней в расписании модели
            apiDifferentDaysCount = 0, // Количество разных дней в расписании модели
            differentWorkingHoursCount = []; // Количество рабочих часов в разных днях

        _.each(model, function(day) {
            if (day && day.working_hours) { // Проверяем что это день, а не комментарий или что-то ещё
                apiScheduleDaysCount++;
                if (!_.isEqual(day, _.last(apiDifferentDays))) {
                    apiDifferentDays.push(day);
                }
            }
        });

        apiDifferentDaysCount = apiDifferentDays.length;
        // Если не все дни описаны в модели, значит есть ещё один тип дней - выходной (отсутствущий в модели)
        if (apiScheduleDaysCount < 7) {
            apiDifferentDaysCount++;
        }

        // Если разных более 2, то упростить не получится - делаем таблицу
        if (apiDifferentDaysCount > 2) {
            schedule.week = makeTable(model);
        } else { // Иначе, составляем комментарий из двух строк

            // Случай, когда все одинаковые
            if (apiDifferentDaysCount == 1) {
                schedule.week = {
                    evently: [makeSimpleString(model[weekKeys[0]], model)]
                };
            } else { // Остаётся случай, когда есть два типа дней
                // Определяем день с наибольшим количеством рабочих часов из числа разных дней
                for (i = 0; i < apiDifferentDaysCount; i++) {
                    differentWorkingHoursCount[i] = 0;

                    if (apiDifferentDays[i]) {
                        var points = getSortedTimePoints(apiDifferentDays[i]);

                        for (var j = 0; j < points.length; j = j + 2) {
                            var hours = (getHours(points[j + 1]) + getMinutes(points[j + 1]) / 60) - (getHours(points[j]) + getMinutes(points[j]) / 60);
                            differentWorkingHoursCount[i] += hours;
                        }
                    } else { // Выходной
                        apiDifferentDays[i] = null;
                    }
                }

                var apiSortedDifferentDays = _.sortBy(apiDifferentDays, function(day, key) {
                    return differentWorkingHoursCount[key];
                });

                schedule.week = {
                    evently: makeAdvancedString(apiSortedDifferentDays, model)
                };
            }
        }

        schedule.comment = model.comment;
        if (schedule.week && schedule.week.evently && schedule.week.evently.length == 1) {
            schedule.everyday = schedule.week.evently[0].everyday;
        }

        return schedule;
    },

    forecast: function (sch) {
        var str,
            interval = '',
            localLang = this.localLang,
            open,
            minHToClose = this.minHoursToDisplayClosure;

        if (sch.always) { // Если круглосуточно, ничего кроме "Открыто" выводить не нужно
            str = FirmCard.Schedule.dictionary.t(localLang, 'isOpen');
            open = true;
        } else {
            if (sch.will.h) {
                interval += FirmCard.Schedule.dictionary.t(localLang, 'nHours', sch.will.h) + ' ';
            }

            if (sch.will.m) {
                interval += FirmCard.Schedule.dictionary.t(localLang, 'nMins', sch.will.m);
            }

            open = !!(sch.now.open && (sch.will.h || sch.will.m)); /* Если до закрытия меньше минуты - считаем что уже закрыто */

            if (open && sch.will.h >= minHToClose) {
                str = FirmCard.Schedule.dictionary.t(localLang, 'openTill') + sch.will.till;
            }

            if (open && sch.will.h < minHToClose) {
                str = FirmCard.Schedule.dictionary.t(localLang, 'closeIn') + interval;
            }

            if (!open && sch.will.h >= minHToClose && sch.will.d === 0) {
                str = FirmCard.Schedule.dictionary.t(localLang, 'openAt') + sch.will.till;
            }

            if (!open && sch.will.h < minHToClose) {
                str = FirmCard.Schedule.dictionary.t(localLang, 'openIn') + interval;
            }

            if (!open && sch.will.d > 0 && sch.will.h >= minHToClose) {
                str = FirmCard.Schedule.dictionary.t(localLang, 'open') + sch.will.when;
            }
        }

        return {str: str, open: open};
    },

    setLang: function (lang) {
        this.localLang = lang || 'ru';

        return this;
    }

}